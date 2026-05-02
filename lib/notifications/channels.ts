/**
 * Canaux d'alerting livrables : webhook (HTTP POST), Slack (webhook URL),
 * email (stub — interface claire jusqu'à ce qu'une infra transactionnelle
 * soit branchée : Resend / SES / Postmark).
 *
 * Chaque canal expose `send(payload)` et retourne un statut. Pas d'exception
 * non capturée : un échec d'un canal n'invalide pas les autres (best-effort).
 */

import type { BusinessSignal } from "@/lib/reports/signals/extract";
import type {
  EmailChannelConfig,
  SlackChannelConfig,
  WebhookChannelConfig,
} from "./schema";

/** Timeout HTTP fixe pour les canaux externes (webhook, Slack). */
export const CHANNEL_HTTP_TIMEOUT_MS = 5_000;
/** 1 retry max avec backoff court (constant). */
const CHANNEL_RETRY_BACKOFF_MS = 500;

export interface AlertContext {
  tenantId: string;
  signal: BusinessSignal;
  report: { id: string; title: string };
  /** ms — utile pour le payload + tests déterministes. */
  emittedAt: number;
}

/** Enveloppe canonique envoyée aux webhooks. */
export interface AlertWebhookPayload {
  v: 1;
  emittedAt: number;
  tenantId: string;
  report: { id: string; title: string };
  signal: {
    type: BusinessSignal["type"];
    severity: BusinessSignal["severity"];
    message: string;
    blockId?: string;
  };
}

type ChannelKind = "webhook" | "slack" | "email";

export interface ChannelResult {
  kind: ChannelKind;
  ok: boolean;
  /** Code HTTP côté webhook/slack ; pour email c'est un statut interne. */
  status?: number;
  error?: string;
  /** Détail libre pour debug (URL tronquée, recipients count, ...). */
  target?: string;
}

// ── Helpers ────────────────────────────────────────────────

function matchesSignalFilter(
  filter: ReadonlyArray<string>,
  type: BusinessSignal["type"],
): boolean {
  if (filter.length === 0) return false;
  if (filter.includes("*")) return true;
  return (filter as ReadonlyArray<string>).includes(type);
}

function buildWebhookPayload(ctx: AlertContext): AlertWebhookPayload {
  return {
    v: 1,
    emittedAt: ctx.emittedAt,
    tenantId: ctx.tenantId,
    report: ctx.report,
    signal: {
      type: ctx.signal.type,
      severity: ctx.signal.severity,
      message: ctx.signal.message,
      blockId: ctx.signal.blockId,
    },
  };
}

/**
 * Fetch avec timeout + 1 retry si la réponse est 5xx ou réseau KO.
 * Retourne `{ ok, status }` sans throw.
 */
async function postJson(
  url: string,
  body: unknown,
  options: { timeoutMs: number; fetcher?: typeof fetch } = {
    timeoutMs: CHANNEL_HTTP_TIMEOUT_MS,
  },
): Promise<{ ok: boolean; status?: number; error?: string }> {
  const fetcher = options.fetcher ?? fetch;
  const attempt = async (): Promise<{ ok: boolean; status?: number; error?: string }> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), options.timeoutMs);
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { ok: false, error };
    } finally {
      clearTimeout(timer);
    }
  };

  const first = await attempt();
  // Pas de retry si le serveur a répondu 4xx (config / payload invalide).
  if (first.ok) return first;
  if (first.status !== undefined && first.status < 500) return first;

  await new Promise((r) => setTimeout(r, CHANNEL_RETRY_BACKOFF_MS));
  return attempt();
}

// ── Webhook ────────────────────────────────────────────────

export async function dispatchWebhook(
  config: WebhookChannelConfig,
  ctx: AlertContext,
  options?: { fetcher?: typeof fetch },
): Promise<ChannelResult | null> {
  if (!matchesSignalFilter(config.signalTypes, ctx.signal.type)) {
    return null;
  }

  const payload = buildWebhookPayload(ctx);
  const res = await postJson(config.url, payload, {
    timeoutMs: CHANNEL_HTTP_TIMEOUT_MS,
    fetcher: options?.fetcher,
  });

  return {
    kind: "webhook",
    ok: res.ok,
    status: res.status,
    error: res.error,
    target: truncateUrl(config.url),
  };
}

// ── Slack ──────────────────────────────────────────────────

function severityEmoji(severity: BusinessSignal["severity"]): string {
  switch (severity) {
    case "critical":
      return "[CRITICAL]";
    case "warning":
      return "[WARN]";
    default:
      return "[INFO]";
  }
}

function buildSlackPayload(ctx: AlertContext): Record<string, unknown> {
  const emoji = severityEmoji(ctx.signal.severity);
  return {
    text: `${emoji} ${ctx.signal.message}`,
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*${emoji} ${ctx.signal.type}*\n${ctx.signal.message}`,
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `Report: *${ctx.report.title}* (id \`${ctx.report.id}\`)`,
          },
        ],
      },
    ],
  };
}

export async function dispatchSlack(
  config: SlackChannelConfig,
  ctx: AlertContext,
  options?: { fetcher?: typeof fetch },
): Promise<ChannelResult | null> {
  if (!matchesSignalFilter(config.signalTypes, ctx.signal.type)) {
    return null;
  }

  const payload = buildSlackPayload(ctx);
  const res = await postJson(config.webhookUrl, payload, {
    timeoutMs: CHANNEL_HTTP_TIMEOUT_MS,
    fetcher: options?.fetcher,
  });

  return {
    kind: "slack",
    ok: res.ok,
    status: res.status,
    error: res.error,
    target: truncateUrl(config.webhookUrl),
  };
}

// ── Email (stub) ───────────────────────────────────────────
//
// Pas d'infra email transactionnelle dans le projet à ce jour (vérifié dans
// package.json — pas de Resend / SES / Postmark / nodemailer). On livre une
// interface claire et un stub qui logge structurellement. Un agent ultérieur
// pourra remplacer `defaultEmailSender` par une vraie implémentation.

export interface EmailMessage {
  to: ReadonlyArray<string>;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(msg: EmailMessage): Promise<{ ok: boolean; id?: string; error?: string }>;
}

/**
 * Stub volontaire — log structuré, ne fait pas d'appel externe.
 * Remplace par une vraie implémentation (Resend.send, SES.SendEmail, ...) :
 *   import { setEmailSender } from "@/lib/notifications/channels";
 *   setEmailSender({ async send(msg) { return resend.emails.send(...) } });
 */
const stubEmailSender: EmailSender = {
  async send(msg) {
    console.warn(
      `[alerting][email-stub] aucun provider email configuré — message non envoyé`,
      {
        to: msg.to,
        subject: msg.subject,
      },
    );
    return { ok: false, error: "email-sender-not-configured" };
  },
};

let activeEmailSender: EmailSender = stubEmailSender;

export function setEmailSender(sender: EmailSender): void {
  activeEmailSender = sender;
}

export function getEmailSender(): EmailSender {
  return activeEmailSender;
}

function buildEmailMessage(
  config: EmailChannelConfig,
  ctx: AlertContext,
): EmailMessage {
  const subject = `[${ctx.signal.severity.toUpperCase()}] ${ctx.signal.type} — ${ctx.report.title}`;
  const text = [
    ctx.signal.message,
    "",
    `Report: ${ctx.report.title} (id ${ctx.report.id})`,
    `Tenant: ${ctx.tenantId}`,
    `Émis: ${new Date(ctx.emittedAt).toISOString()}`,
  ].join("\n");
  return { to: config.recipients, subject, text };
}

export async function dispatchEmail(
  config: EmailChannelConfig,
  ctx: AlertContext,
  options?: { sender?: EmailSender },
): Promise<ChannelResult | null> {
  if (!matchesSignalFilter(config.signalTypes, ctx.signal.type)) {
    return null;
  }

  const sender = options?.sender ?? activeEmailSender;
  const msg = buildEmailMessage(config, ctx);
  try {
    const res = await sender.send(msg);
    return {
      kind: "email",
      ok: res.ok,
      error: res.error,
      target: `${config.recipients.length} recipient(s)`,
    };
  } catch (err) {
    return {
      kind: "email",
      ok: false,
      error: err instanceof Error ? err.message : String(err),
      target: `${config.recipients.length} recipient(s)`,
    };
  }
}

// ── Utils ──────────────────────────────────────────────────

function truncateUrl(url: string): string {
  if (url.length <= 60) return url;
  return `${url.slice(0, 30)}...${url.slice(-20)}`;
}

