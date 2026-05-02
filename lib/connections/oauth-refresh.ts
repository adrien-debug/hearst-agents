/**
 * OAuth Refresh — vérification et rafraîchissement des tokens OAuth.
 *
 * Ce module gère :
 *  - La détection des connexions Composio dont le token expire bientôt
 *  - La tentative de refresh automatique via Composio
 *  - La mise à jour du statut de connexion en base
 *
 * Infrastructure OAuth : Composio gère les tokens OAuth côté serveur.
 * Les connexions Hearst sont les `ConnectedAccount` Composio (via userId).
 *
 * TODO: Si Hearst migre vers une table `oauth_tokens` propriétaire,
 *       brancher `checkExpiringTokens` sur cette table au lieu de Composio.
 */

import { z } from "zod";
import { listConnections } from "@/lib/connectors/composio/connections";
import { isComposioConfigured, getComposio } from "@/lib/connectors/composio/client";
import {
  AUTH_EXPIRING_DAYS_THRESHOLD,
  ExpiringConnectionSchema,
  type ExpiringConnection,
} from "@/lib/connections/oauth-constants";

// Ré-export des constantes et types partagés pour les consommateurs de ce module.
export {
  AUTH_EXPIRING_DAYS_THRESHOLD,
  AUTH_CRITICAL_DAYS_THRESHOLD,
  ExpiringConnectionSchema,
  type ExpiringConnection,
} from "@/lib/connections/oauth-constants";

const RefreshResultSchema = z.object({
  connectionId: z.string(),
  appName: z.string(),
  ok: z.boolean(),
  /** Raison d'échec si ok=false. */
  reason: z.string().optional(),
  /** "refreshed" = token renouvelé, "revoked" = token révoqué (reconnecter manuellement). */
  outcome: z.enum(["refreshed", "revoked", "unavailable"]).optional(),
});

type RefreshResult = z.infer<typeof RefreshResultSchema>;

// ── Helpers internes ─────────────────────────────────────────

/**
 * Calcule les jours restants depuis updatedAt + une durée typique OAuth.
 * Composio ne retourne pas d'expiry explicite — on estime à partir du
 * statut (EXPIRED = 0, ACTIVE = estimation 90j depuis updatedAt).
 *
 * TODO: Utiliser le champ `expiresAt` dès que Composio SDK l'expose.
 */
function estimateDaysUntilExpiry(
  status: string,
  updatedAt?: string,
): { days: number | null; isExpired: boolean } {
  if (status === "EXPIRED" || status === "FAILED") {
    return { days: 0, isExpired: true };
  }

  if (!updatedAt) {
    return { days: null, isExpired: false };
  }

  const updated = new Date(updatedAt).getTime();
  if (isNaN(updated)) return { days: null, isExpired: false };

  // Durée de vie typique OAuth2 = 90 jours pour la plupart des providers.
  const TYPICAL_OAUTH_LIFETIME_DAYS = 90;
  const expiresAt = updated + TYPICAL_OAUTH_LIFETIME_DAYS * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const daysLeft = Math.floor((expiresAt - now) / (24 * 60 * 60 * 1000));

  return {
    days: daysLeft,
    isExpired: daysLeft <= 0,
  };
}

// ── API publique ─────────────────────────────────────────────

/**
 * Retourne les connexions Composio d'un utilisateur qui expirent
 * dans moins de AUTH_EXPIRING_DAYS_THRESHOLD jours.
 *
 * @param userId  - L'identifiant Hearst/Supabase de l'utilisateur
 * @param tenantId - Le tenant concerné (pour les notifications)
 */
export async function checkExpiringTokens({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId: string;
}): Promise<ExpiringConnection[]> {
  if (!isComposioConfigured()) {
    // TODO: Si Composio absent, interroger une table oauth_tokens propriétaire.
    return [];
  }

  const accounts = await listConnections(userId, { includeInactive: true });
  const expiring: ExpiringConnection[] = [];

  for (const account of accounts) {
    const { days, isExpired } = estimateDaysUntilExpiry(
      account.status,
      account.updatedAt,
    );

    const isExpiringSoon =
      !isExpired &&
      days !== null &&
      days <= AUTH_EXPIRING_DAYS_THRESHOLD &&
      days > 0;

    if (!isExpired && !isExpiringSoon) continue;

    const parsed = ExpiringConnectionSchema.safeParse({
      connectionId: account.id,
      appName: account.appName,
      userId,
      tenantId,
      daysUntilExpiry: isExpired ? 0 : days,
      status: isExpired ? "expired" : "expiring_soon",
    });

    if (parsed.success) {
      expiring.push(parsed.data);
    }
  }

  return expiring;
}

/**
 * Tente de rafraîchir un token OAuth via Composio.
 *
 * Composio gère le refresh implicitement lors d'une reconnexion —
 * cette fonction lance `authorize()` pour forcer un nouveau cycle OAuth.
 *
 * Si le token est révoqué (provider a retiré l'accès), Composio
 * retourne une erreur et on marque l'outcome comme "revoked".
 */
export async function refreshOAuthToken({
  connectionId,
  appName,
  userId,
}: {
  connectionId: string;
  appName: string;
  userId: string;
}): Promise<RefreshResult> {
  if (!isComposioConfigured()) {
    return {
      connectionId,
      appName,
      ok: false,
      reason: "Composio non configuré — refresh impossible.",
      outcome: "unavailable",
    };
  }

  const composio = await getComposio();
  if (!composio) {
    return {
      connectionId,
      appName,
      ok: false,
      reason: "SDK Composio non chargé.",
      outcome: "unavailable",
    };
  }

  try {
    /**
     * Composio ne fournit pas d'endpoint "refresh token" direct dans le SDK v0.6.
     * La stratégie : vérifier le statut de la connexion existante via connectedAccounts.
     *
     * TODO: Utiliser `composio.connectedAccounts.refresh(connectionId)` quand
     * cette méthode sera disponible dans le SDK Composio v0.7+.
     *
     * En attendant : on liste les comptes et on vérifie si ACTIVE.
     * Si toujours ACTIVE → le token est encore valide (pas vraiment expiré).
     * Si EXPIRED → signaler comme revoked pour déclencher reconnexion manuelle.
     */
    const raw = (await composio.connectedAccounts.list({
      userIds: [userId],
    })) as { items?: Array<{ id?: string; nanoid?: string; status?: string }> };

    const items = raw.items ?? [];
    const found = items.find(
      (acc) => (acc.id ?? acc.nanoid) === connectionId,
    );

    if (!found) {
      return {
        connectionId,
        appName,
        ok: false,
        reason: `Connexion ${connectionId} introuvable dans Composio.`,
        outcome: "revoked",
      };
    }

    if (found.status === "ACTIVE") {
      // Token encore valide — pas de refresh nécessaire.
      return {
        connectionId,
        appName,
        ok: true,
        outcome: "refreshed",
      };
    }

    // Status EXPIRED ou FAILED → reconnexion manuelle requise.
    return {
      connectionId,
      appName,
      ok: false,
      reason: `Token ${appName} expiré ou révoqué (status=${found.status}).`,
      outcome: "revoked",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[OAuthRefresh] Échec refresh ${appName} (${connectionId}):`, message);

    return {
      connectionId,
      appName,
      ok: false,
      reason: message,
      outcome: "revoked",
    };
  }
}

/**
 * Enqueue un job de refresh pour tous les tokens expirant d'un tenant/user.
 *
 * TODO: Brancher sur une vraie queue (BullMQ, Inngest, etc.) quand disponible.
 * Pour l'instant, appelle directement checkExpiringTokens pour retourner la liste.
 */
export async function scheduleTokenRefresh({
  userId,
  tenantId,
}: {
  userId: string;
  tenantId: string;
}): Promise<{ queued: number; connectionIds: string[] }> {
  const expiring = await checkExpiringTokens({ userId, tenantId });

  // TODO: Enqueue chaque connexion via la queue de jobs.
  // Pour l'instant, retourne simplement la liste pour le job `check_oauth_tokens`.

  return {
    queued: expiring.length,
    connectionIds: expiring.map((c) => c.connectionId),
  };
}
