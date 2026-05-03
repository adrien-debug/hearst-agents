/**
 * Inbox Brief Generator — agrège Gmail/Slack/Calendar en items priorisés.
 *
 * Pipeline :
 *  1. Promise.allSettled sur 3 sources (Gmail unread, Slack channels, Calendar today)
 *  2. Normalisation en `InboxItem`
 *  3. Classify priorité + summary via Claude Haiku (1 prompt batché)
 *  4. Cap à 10 items
 *
 * Fail-soft : chaque source isolée, une erreur sur l'une marque
 * `sources: "<source>:error"` mais ne casse pas les autres.
 *
 * Gmail : on utilise les tools natifs Google (NextAuth scopes) car ils sont
 * plus rapides et ne nécessitent pas Composio.
 * Slack : Composio `SLACK_LIST_MESSAGES` (action déjà cataloguée).
 * Calendar : tool natif Google.
 */

import Anthropic from "@anthropic-ai/sdk";
import { getRecentEmails } from "@/lib/connectors/google/gmail";
import { getTodayEvents } from "@/lib/connectors/google/calendar";
import { executeComposioAction, isComposioConfigured } from "@/lib/connectors/composio/client";
import { INBOX_PRIORITY_FEWSHOT, formatFewShotBlock } from "@/lib/prompts/examples";
import { composeEditorialPrompt } from "@/lib/editorial/charter";

/**
 * Prompt classification inbox — assistant de tri d'un founder pressé.
 *
 * Classe chaque item en 3 niveaux selon des critères explicites + produit
 * un summary 1 ligne (max 80 chars) qui synthétise l'enjeu réel, pas le sujet.
 */
export const INBOX_PRIORITY_SYSTEM_PROMPT = composeEditorialPrompt([
  "Tu tries la boîte de réception d'un founder pressé. Pour chaque item, tu produis une priorité et un summary 1 ligne.",
  "",
  "CRITÈRES STRICTS :",
  "- urgent : action requise sous 24h ET bloquant (signature en attente, deadline imminente, demande directe d'un client clé ou exec).",
  "- important : réponse attendue dans la journée (question d'un partenaire, ticket support, info produit qui demande arbitrage).",
  "- info : FYI uniquement (newsletter, notification automatique, compte rendu pour archive, digest).",
  "",
  "RÈGLES DE SUMMARY :",
  "- Max 80 caractères.",
  "- Nomme l'enjeu réel (ce qui doit se passer), pas le sujet de l'email.",
  "- Pas de paraphrase du title.",
  "",
  "FORMAT STRICT — JSON ARRAY uniquement :",
  '[{ "id": string, "priority": "urgent"|"important"|"info", "summary": string }]',
  "",
  "EXEMPLES :",
  formatFewShotBlock(INBOX_PRIORITY_FEWSHOT),
].join("\n"));

export type InboxItemKind = "email" | "slack" | "calendar";
export type InboxItemPriority = "urgent" | "important" | "info";
export type InboxActionKind = "reply" | "draft" | "schedule" | "snooze" | "open";

export interface SuggestedAction {
  kind: InboxActionKind;
  label: string;
  payload?: Record<string, unknown>;
}

export interface InboxItem {
  id: string;
  kind: InboxItemKind;
  priority: InboxItemPriority;
  title: string;
  summary: string;
  source: string;
  originUrl?: string;
  suggestedActions: SuggestedAction[];
  receivedAt: number;
  /** Snoozed jusqu'à ce timestamp — si > now, l'UI doit le filtrer. */
  snoozedUntil?: number;
}

export interface InboxBrief {
  items: InboxItem[];
  generatedAt: number;
  /** Liste des sources qui ont contribué (ou échoué) : "gmail", "slack:error", etc. */
  sources: string[];
  /** True quand aucune source n'a remonté de signal exploitable. */
  empty: boolean;
}

const MAX_ITEMS = 10;
const HAIKU_MODEL = "claude-haiku-4-5-20251001";
const TRUNCATE_SUMMARY = 80;

interface RawEmail {
  id: string;
  subject: string;
  sender: string;
  snippet: string;
  date: string;
  isRead: boolean;
}

interface RawSlackMessage {
  channel: string;
  text: string;
  ts: string;
  user?: string;
}

interface RawCalendarEvent {
  id: string;
  title: string;
  startTime: string;
  attendees?: string[];
  location?: string;
}

// ── Normalisation ─────────────────────────────────────────────

function emailToItem(email: RawEmail): InboxItem {
  const senderName = email.sender.replace(/<[^>]+>/g, "").trim() || email.sender;
  const ts = Date.parse(email.date) || Date.now();
  return {
    id: `email:${email.id}`,
    kind: "email",
    priority: "info",
    title: email.subject || "(sans sujet)",
    summary: email.snippet.slice(0, TRUNCATE_SUMMARY) || `de ${senderName}`,
    source: senderName,
    originUrl: `https://mail.google.com/mail/u/0/#inbox/${email.id}`,
    suggestedActions: [
      { kind: "reply", label: "Répondre", payload: { messageId: email.id, sender: email.sender, subject: email.subject } },
      { kind: "draft", label: "Brouillon", payload: { messageId: email.id, sender: email.sender, subject: email.subject } },
      { kind: "snooze", label: "Snooze", payload: { itemId: `email:${email.id}` } },
      { kind: "open", label: "Ouvrir", payload: { url: `https://mail.google.com/mail/u/0/#inbox/${email.id}` } },
    ],
    receivedAt: ts,
  };
}

function slackToItem(msg: RawSlackMessage): InboxItem {
  const ts = Math.round(parseFloat(msg.ts) * 1000) || Date.now();
  return {
    id: `slack:${msg.channel}:${msg.ts}`,
    kind: "slack",
    priority: "info",
    title: `#${msg.channel}`,
    summary: msg.text.slice(0, TRUNCATE_SUMMARY) || "(message)",
    source: msg.user ? `@${msg.user}` : `#${msg.channel}`,
    suggestedActions: [
      { kind: "reply", label: "Répondre", payload: { channel: msg.channel, ts: msg.ts } },
      { kind: "snooze", label: "Snooze", payload: { itemId: `slack:${msg.channel}:${msg.ts}` } },
      { kind: "open", label: "Ouvrir", payload: { channel: msg.channel } },
    ],
    receivedAt: ts,
  };
}

function calendarToItem(event: RawCalendarEvent): InboxItem {
  const startMs = Date.parse(event.startTime) || Date.now();
  const attendees = event.attendees?.slice(0, 3).join(", ") ?? "";
  return {
    id: `calendar:${event.id}`,
    kind: "calendar",
    priority: "info",
    title: event.title,
    summary: (attendees ? `avec ${attendees}` : event.location ?? "Réunion").slice(0, TRUNCATE_SUMMARY),
    source: "Calendar",
    suggestedActions: [
      { kind: "schedule", label: "Préparer brief", payload: { eventId: event.id, title: event.title } },
      { kind: "snooze", label: "Snooze", payload: { itemId: `calendar:${event.id}` } },
      { kind: "open", label: "Ouvrir", payload: { eventId: event.id } },
    ],
    receivedAt: startMs,
  };
}

// ── Classify via Haiku (batch) ────────────────────────────────

interface ClassifiedItem {
  id: string;
  priority: InboxItemPriority;
  summary: string;
}

async function classifyBatch(items: InboxItem[]): Promise<Map<string, ClassifiedItem>> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || items.length === 0) return new Map();

  // Construit un payload compact : id + kind + title + extrait
  const compact = items.slice(0, 30).map((it) => ({
    id: it.id,
    kind: it.kind,
    title: it.title.slice(0, 120),
    excerpt: it.summary.slice(0, 200),
  }));

  const anthropic = new Anthropic({ apiKey });
  try {
    const res = await anthropic.messages.create({
      model: HAIKU_MODEL,
      max_tokens: 1500,
      system: INBOX_PRIORITY_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [
            "Items à classer (JSON) :",
            JSON.stringify(compact),
            "",
            "Classe maintenant, en respectant strictement le format JSON array.",
          ].join("\n"),
        },
      ],
    });

    const block = res.content[0];
    const text = block.type === "text" ? block.text : "";
    const match = text.match(/\[[\s\S]*\]/);
    if (!match) return new Map();

    const parsed = JSON.parse(match[0]) as ClassifiedItem[];
    const out = new Map<string, ClassifiedItem>();
    for (const c of parsed) {
      if (c.id && (c.priority === "urgent" || c.priority === "important" || c.priority === "info")) {
        out.set(c.id, {
          id: c.id,
          priority: c.priority,
          summary: (c.summary ?? "").slice(0, TRUNCATE_SUMMARY),
        });
      }
    }
    return out;
  } catch (err) {
    console.warn("[inbox-brief] Haiku classify failed, fallback heuristic:", err);
    return new Map();
  }
}

/** Fallback heuristique quand Haiku indisponible : keywords basiques. */
function heuristicPriority(item: InboxItem): InboxItemPriority {
  const text = `${item.title} ${item.summary}`.toLowerCase();
  if (/urgent|asap|deadline|aujourd'hui|today|critique|bloqué|blocked/.test(text)) return "urgent";
  if (/\?|action|merci de|please|need|review|valider/.test(text)) return "important";
  return "info";
}

// ── Source fetchers ──────────────────────────────────────────

async function fetchGmailUnread(userId: string, limit: number): Promise<RawEmail[]> {
  const emails = await getRecentEmails(userId, limit);
  return emails.filter((e) => !e.isRead);
}

async function fetchCalendarToday(userId: string, limit: number): Promise<RawCalendarEvent[]> {
  const events = await getTodayEvents(userId, limit);
  return events.map((e) => ({
    id: e.id,
    title: e.title,
    startTime: e.startTime,
    attendees: e.attendees,
    location: e.location,
  }));
}

async function fetchSlackUnread(userId: string): Promise<RawSlackMessage[]> {
  if (!isComposioConfigured()) return [];

  // SLACK_LIST_MESSAGES : on tire les messages récents du channel "general" ou
  // "general-equivalents". Pour MVP on prend juste les messages les plus récents.
  // Composio ne fournit pas un "unread per channel" cross-workspace, on
  // approxime avec les messages des dernières 4h.
  const since = Math.floor((Date.now() - 4 * 3600_000) / 1000);
  const result = await executeComposioAction({
    action: "SLACK_LIST_MESSAGES",
    entityId: userId,
    params: { oldest: String(since), limit: 10 },
  });

  if (!result.ok) return [];
  const data = result.data as { messages?: Array<{ channel?: string; text?: string; ts?: string; user?: string }> } | undefined;
  const msgs = data?.messages ?? [];
  return msgs
    .filter((m): m is { channel: string; text: string; ts: string; user?: string } =>
      typeof m.channel === "string" && typeof m.text === "string" && typeof m.ts === "string",
    )
    .slice(0, 5);
}

// ── Main entry ───────────────────────────────────────────────

export interface GenerateInboxBriefOptions {
  gmailLimit?: number;
  calendarLimit?: number;
}

export async function generateInboxBrief(
  userId: string,
  _tenantId: string,
  opts: GenerateInboxBriefOptions = {},
): Promise<InboxBrief> {
  const gmailLimit = opts.gmailLimit ?? 20;
  const calendarLimit = opts.calendarLimit ?? 10;

  const [emailsRes, slackRes, calendarRes] = await Promise.allSettled([
    fetchGmailUnread(userId, gmailLimit),
    fetchSlackUnread(userId),
    fetchCalendarToday(userId, calendarLimit),
  ]);

  const sources: string[] = [];
  const items: InboxItem[] = [];

  if (emailsRes.status === "fulfilled") {
    sources.push("gmail");
    items.push(...emailsRes.value.map(emailToItem));
  } else {
    sources.push("gmail:error");
    console.warn("[inbox-brief] gmail fetch failed:", emailsRes.reason);
  }

  if (slackRes.status === "fulfilled") {
    sources.push("slack");
    items.push(...slackRes.value.map(slackToItem));
  } else {
    sources.push("slack:error");
    console.warn("[inbox-brief] slack fetch failed:", slackRes.reason);
  }

  if (calendarRes.status === "fulfilled") {
    sources.push("calendar");
    items.push(...calendarRes.value.map(calendarToItem));
  } else {
    sources.push("calendar:error");
    console.warn("[inbox-brief] calendar fetch failed:", calendarRes.reason);
  }

  // Classify via Haiku (1 batch)
  const classified = await classifyBatch(items);

  for (const item of items) {
    const c = classified.get(item.id);
    if (c) {
      item.priority = c.priority;
      if (c.summary && c.summary.length > 0) item.summary = c.summary;
    } else {
      item.priority = heuristicPriority(item);
    }
  }

  // Tri : urgent → important → info, puis par receivedAt desc.
  const priorityWeight: Record<InboxItemPriority, number> = { urgent: 0, important: 1, info: 2 };
  items.sort((a, b) => {
    const dp = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (dp !== 0) return dp;
    return b.receivedAt - a.receivedAt;
  });

  const capped = items.slice(0, MAX_ITEMS);

  return {
    items: capped,
    generatedAt: Date.now(),
    sources,
    empty: capped.length === 0,
  };
}
