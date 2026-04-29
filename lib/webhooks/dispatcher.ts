/**
 * Dispatcher webhooks custom.
 *
 * - Charge les webhooks actifs du tenant qui souscrivent à l'event
 * - Signe le payload HMAC-SHA256 si un secret est configuré
 *   (header X-Hearst-Signature: sha256=<hex>)
 * - POST avec timeout 5s, 2 retries sur 5xx/réseau KO
 * - Met à jour last_triggered_at + last_status en DB
 * - Fire-and-forget : jamais de throw vers le caller
 */

import { createHmac } from "crypto";
import { getActiveWebhooksForEvent, updateWebhookStatus } from "./store";
import type { WebhookEvent, WebhookPayload, CustomWebhook } from "./types";

/** Timeout HTTP strict (identique à lib/notifications/channels.ts). */
const HTTP_TIMEOUT_MS = 5_000;
/** Backoff entre les retries (ms). */
const RETRY_BACKOFF_MS = 500;
/** Nombre max de tentatives (1 initiale + 2 retries sur 5xx). */
const MAX_RETRIES = 2;

// ── Signing ──────────────────────────────────────────────────

/**
 * Calcule la signature HMAC-SHA256 du body JSON stringifié.
 * Retourne `sha256=<hex>` (même format que GitHub webhooks).
 */
export function signPayload(secret: string, body: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(body);
  return `sha256=${hmac.digest("hex")}`;
}

// ── HTTP POST avec retry ─────────────────────────────────────

interface PostResult {
  ok: boolean;
  status?: number;
  error?: string;
}

async function postWithRetry(
  url: string,
  body: string,
  headers: Record<string, string>,
  fetcher: typeof fetch = fetch,
): Promise<PostResult> {
  const attempt = async (): Promise<PostResult> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HTTP_TIMEOUT_MS);
    try {
      const res = await fetcher(url, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal: ctrl.signal,
      });
      return { ok: res.ok, status: res.status };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      };
    } finally {
      clearTimeout(timer);
    }
  };

  let last: PostResult = { ok: false, error: "not started" };

  for (let i = 0; i <= MAX_RETRIES; i++) {
    if (i > 0) {
      await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS));
    }
    last = await attempt();

    // Succès → stop
    if (last.ok) return last;
    // 4xx → pas de retry (payload / config invalide)
    if (last.status !== undefined && last.status >= 400 && last.status < 500) {
      return last;
    }
    // 5xx ou réseau KO → continue (jusqu'à MAX_RETRIES)
  }

  return last;
}

// ── Dispatch d'un seul webhook ────────────────────────────────

async function dispatchOne(
  webhook: CustomWebhook,
  payload: WebhookPayload,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const bodyStr = JSON.stringify(payload);
  const headers: Record<string, string> = {};

  if (webhook.secret) {
    headers["x-hearst-signature"] = signPayload(webhook.secret, bodyStr);
  }

  const result = await postWithRetry(webhook.url, bodyStr, headers, fetcher);
  const status: "success" | "failed" = result.ok ? "success" : "failed";

  if (!result.ok) {
    console.warn(
      `[WebhookDispatcher] Échec delivery webhook "${webhook.name}" (${webhook.id}) ` +
        `— status=${result.status ?? "?"} error=${result.error ?? ""}`,
    );
  }

  // Mise à jour statut (fire-and-forget, jamais de throw)
  updateWebhookStatus({
    id: webhook.id,
    status,
    triggeredAt: payload.timestamp,
  }).catch((err) => {
    console.error(
      `[WebhookDispatcher] Impossible de mettre à jour le statut du webhook ${webhook.id}:`,
      err instanceof Error ? err.message : String(err),
    );
  });
}

// ── API publique ─────────────────────────────────────────────

/**
 * Déclenche tous les webhooks actifs d'un tenant pour un événement donné.
 *
 * Fire-and-forget : ne throw jamais vers le caller.
 * Le résultat est loggé mais jamais propagé.
 *
 * @param event - L'événement produit déclencheur
 * @param tenantId - Le tenant concerné
 * @param data - Données contextuelles de l'événement
 * @param fetcher - Override pour les tests
 */
export function dispatchWebhookEvent(
  event: WebhookEvent,
  tenantId: string,
  data: Record<string, unknown>,
  fetcher?: typeof fetch,
): void {
  // Fire-and-forget : on lance la Promise sans await
  void (async () => {
    try {
      const webhooks = await getActiveWebhooksForEvent({ tenantId, event });

      if (webhooks.length === 0) return;

      const payload: WebhookPayload = {
        event,
        tenantId,
        timestamp: new Date().toISOString(),
        data,
      };

      await Promise.allSettled(
        webhooks.map((wh) => dispatchOne(wh, payload, fetcher ?? fetch)),
      );
    } catch (err) {
      console.error(
        `[WebhookDispatcher] Erreur non attendue pour event="${event}" tenant="${tenantId}":`,
        err instanceof Error ? err.message : String(err),
      );
    }
  })();
}

/**
 * Version async (attendable) pour les tests et l'endpoint /test.
 * Même logique que dispatchWebhookEvent mais retourne une Promise.
 */
export async function dispatchWebhookEventAsync(
  event: WebhookEvent | "test.ping",
  tenantId: string,
  data: Record<string, unknown>,
  fetcher?: typeof fetch,
  webhookOverride?: CustomWebhook[],
): Promise<{ dispatched: number; results: Array<{ id: string; ok: boolean }> }> {
  const webhooks =
    webhookOverride ??
    (event !== "test.ping"
      ? await getActiveWebhooksForEvent({ tenantId, event: event as WebhookEvent })
      : []);

  if (webhooks.length === 0) return { dispatched: 0, results: [] };

  const payload: WebhookPayload = {
    event: event as WebhookEvent,
    tenantId,
    timestamp: new Date().toISOString(),
    data,
  };

  const results = await Promise.allSettled(
    webhooks.map(async (wh) => {
      const bodyStr = JSON.stringify(payload);
      const headers: Record<string, string> = {};
      if (wh.secret) {
        headers["x-hearst-signature"] = signPayload(wh.secret, bodyStr);
      }
      const result = await postWithRetry(wh.url, bodyStr, headers, fetcher ?? fetch);
      const status: "success" | "failed" = result.ok ? "success" : "failed";
      updateWebhookStatus({
        id: wh.id,
        status,
        triggeredAt: payload.timestamp,
      }).catch(() => {});
      return { id: wh.id, ok: result.ok };
    }),
  );

  return {
    dispatched: webhooks.length,
    results: results.map((r) =>
      r.status === "fulfilled" ? r.value : { id: "unknown", ok: false },
    ),
  };
}

// Export pour les tests internes
export const __testInternals = {
  signPayload,
  postWithRetry,
};
