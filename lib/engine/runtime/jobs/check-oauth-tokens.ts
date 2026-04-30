/**
 * Job `check_oauth_tokens` — vérification quotidienne des tokens OAuth.
 *
 * Flow :
 *   1. `checkExpiringTokens({ userId, tenantId })` — liste les connexions proches de l'expiry
 *   2. Pour chaque token expirant :
 *      a. Tente un refresh automatique via `refreshOAuthToken()`
 *      b. Si refresh OK → notification in-app "info" : "Token [App] rafraîchi"
 *      c. Si refresh impossible (revoked) → notification in-app "critical" : "Reconnectez [App]"
 *   3. Dispatch webhook `"auth.token_expiring"` si des connexions expirent
 *
 * Le job ne throw jamais — tous les chemins d'erreur sont absorbés et loggés.
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import {
  checkExpiringTokens,
  refreshOAuthToken,
  AUTH_EXPIRING_DAYS_THRESHOLD,
} from "@/lib/connections/oauth-refresh";
import { createNotification } from "@/lib/notifications/in-app";
import { dispatchWebhookEvent } from "@/lib/webhooks/dispatcher";
import type { WebhookEvent } from "@/lib/webhooks/types";

// ── Schéma payload du job ────────────────────────────────────

export const checkOAuthTokensPayloadSchema = z.object({
  /** L'identifiant Supabase du user dont on vérifie les tokens. */
  userId: z.string().uuid("userId doit être un UUID"),
  /** Le tenant concerné. */
  tenantId: z.string().uuid("tenantId doit être un UUID"),
  /**
   * Si true : ne dispatch PAS le webhook (utile pour les tests ou appels manuels).
   * @default false
   */
  dryRun: z.boolean().optional().default(false),
});

export type CheckOAuthTokensPayload = z.infer<typeof checkOAuthTokensPayloadSchema>;

// ── Résultat du job ──────────────────────────────────────────

export interface CheckOAuthTokensResult {
  ok: boolean;
  checked: number;
  refreshed: number;
  revoked: number;
  notificationsSent: number;
  webhookDispatched: boolean;
  error?: string;
}

// ── Supabase client interne ──────────────────────────────────

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

// ── Job principal ────────────────────────────────────────────

/**
 * Vérifie les tokens OAuth d'un utilisateur, tente les refresh possibles,
 * crée les notifications in-app appropriées, et dispatch le webhook.
 */
export async function runCheckOAuthTokensJob(
  rawPayload: unknown,
): Promise<CheckOAuthTokensResult> {
  // Validation Zod
  const parsed = checkOAuthTokensPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      checked: 0,
      refreshed: 0,
      revoked: 0,
      notificationsSent: 0,
      webhookDispatched: false,
      error: `Payload invalide : ${issue?.message ?? "erreur inconnue"}`,
    };
  }

  const { userId, tenantId, dryRun } = parsed.data;
  const db = getDb();

  let checked = 0;
  let refreshed = 0;
  let revoked = 0;
  let notificationsSent = 0;
  let webhookDispatched = false;

  // 1. Récupérer les tokens expirants
  let expiring;
  try {
    expiring = await checkExpiringTokens({ userId, tenantId });
  } catch (err) {
    console.error("[check-oauth-tokens] checkExpiringTokens a échoué:", err);
    return {
      ok: false,
      checked: 0,
      refreshed: 0,
      revoked: 0,
      notificationsSent: 0,
      webhookDispatched: false,
      error: err instanceof Error ? err.message : "checkExpiringTokens a échoué",
    };
  }

  checked = expiring.length;

  if (checked === 0) {
    return {
      ok: true,
      checked: 0,
      refreshed: 0,
      revoked: 0,
      notificationsSent: 0,
      webhookDispatched: false,
    };
  }

  // 2. Traiter chaque connexion expirante
  for (const conn of expiring) {
    const daysLabel =
      conn.daysUntilExpiry === 0
        ? "expiré"
        : conn.daysUntilExpiry !== null
          ? `dans ${conn.daysUntilExpiry}j`
          : "bientôt";

    let refreshOk = false;

    if (conn.status === "expired") {
      // Token déjà expiré → pas de refresh possible
      refreshOk = false;
    } else {
      // Tentative de refresh
      try {
        const result = await refreshOAuthToken({
          connectionId: conn.connectionId,
          appName: conn.appName,
          userId: conn.userId,
        });
        refreshOk = result.ok;
      } catch (err) {
        console.error(
          `[check-oauth-tokens] Refresh échoué pour ${conn.appName}:`,
          err,
        );
        refreshOk = false;
      }
    }

    if (refreshOk) {
      refreshed++;
      // Notification "info" : token rafraîchi avec succès
      if (db) {
        const notif = await createNotification(db, {
          tenantId,
          userId,
          kind: "signal",
          severity: "info",
          title: `Token ${conn.appName} rafraîchi`,
          body: `La connexion ${conn.appName} a été renouvelée automatiquement (${daysLabel}).`,
          meta: {
            connectionId: conn.connectionId,
            appName: conn.appName,
            event: "auth.token_refreshed",
          },
        });
        if (notif) notificationsSent++;
      }
    } else {
      revoked++;
      // Notification "critical" : reconnexion manuelle requise
      if (db) {
        const notif = await createNotification(db, {
          tenantId,
          userId,
          kind: "signal",
          severity: "critical",
          title: `Reconnectez ${conn.appName} dans les ${AUTH_EXPIRING_DAYS_THRESHOLD} jours`,
          body: `Le token ${conn.appName} est ${daysLabel} et ne peut pas être rafraîchi automatiquement. Reconnectez cette application pour éviter l'interruption de service.`,
          meta: {
            connectionId: conn.connectionId,
            appName: conn.appName,
            event: "auth.token_expiring",
            daysUntilExpiry: conn.daysUntilExpiry,
          },
        });
        if (notif) notificationsSent++;
      }
    }
  }

  // 3. Dispatch webhook `auth.token_expiring`
  if (!dryRun && checked > 0) {
    try {
      dispatchWebhookEvent(
        "auth.token_expiring" as WebhookEvent,
        tenantId,
        {
          userId,
          totalExpiring: checked,
          refreshed,
          revoked,
          connections: expiring.map((c) => ({
            connectionId: c.connectionId,
            appName: c.appName,
            daysUntilExpiry: c.daysUntilExpiry,
            status: c.status,
          })),
        },
      );
      webhookDispatched = true;
    } catch (err) {
      // Fire-and-forget : on log mais on ne fail pas le job
      console.error("[check-oauth-tokens] Webhook dispatch échoué:", err);
    }
  }

  return {
    ok: true,
    checked,
    refreshed,
    revoked,
    notificationsSent,
    webhookDispatched,
  };
}

/**
 * Helper pour construire un payload valide (utile pour le scheduler).
 */
export function buildCheckOAuthTokensPayload(
  userId: string,
  tenantId: string,
  opts: { dryRun?: boolean } = {},
): CheckOAuthTokensPayload {
  return checkOAuthTokensPayloadSchema.parse({
    userId,
    tenantId,
    dryRun: opts.dryRun ?? false,
  });
}
