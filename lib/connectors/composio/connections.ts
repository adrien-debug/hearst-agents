/**
 * Composio Connections — manage a user's connected third-party accounts.
 *
 * `entityId` is the Composio identity. We pass our Hearst user_id directly
 * so a user's connections in Composio are 1:1 with the user in our system.
 * No cross-tenant credential leak possible: Composio enforces isolation
 * server-side based on entityId.
 */

import { getComposioToolset, isComposioConfigured } from "./client";
import { invalidateUserDiscovery } from "./discovery";

export interface ConnectedAccount {
  id: string;
  appName: string;
  status: "INITIATED" | "ACTIVE" | "FAILED" | "EXPIRED" | "DELETED" | "INACTIVE" | string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InitiateConnectionResult {
  ok: boolean;
  /** OAuth URL the user should be redirected to. Null when no OAuth needed (API_KEY apps). */
  redirectUrl?: string | null;
  /** Composio's id for the pending connection. */
  connectionId?: string;
  error?: string;
  /** Stable code the UI can branch on. */
  errorCode?:
    | "NOT_CONFIGURED"
    | "NO_INTEGRATION"
    | "AUTH_CONFIG_REQUIRED"
    | "INVALID_INPUT"
    | "UPSTREAM_ERROR"
    | "UNKNOWN";
  /** Raw error payload for debugging (Composio's response body). */
  details?: unknown;
}

interface RawConnectedAccount {
  id?: string;
  appName?: string;
  appUniqueId?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface ListResponse {
  items?: RawConnectedAccount[];
  // Some SDK shapes return `connectedAccounts` instead of `items`; be permissive.
  connectedAccounts?: RawConnectedAccount[];
}

function normalizeAccount(raw: RawConnectedAccount): ConnectedAccount | null {
  if (!raw.id) return null;
  return {
    id: raw.id,
    appName: (raw.appName ?? raw.appUniqueId ?? "").toLowerCase(),
    status: raw.status ?? "INACTIVE",
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
  };
}

/**
 * Start an OAuth (or API-key) flow to connect `appName` for `userId`.
 * Returns the URL to redirect the user to. Composio's redirect-after-auth
 * lands on `redirectUri` when provided.
 */
export async function initiateConnection(
  userId: string,
  appName: string,
  redirectUri?: string,
): Promise<InitiateConnectionResult> {
  if (!isComposioConfigured()) {
    return {
      ok: false,
      error: "COMPOSIO_API_KEY not configured.",
      errorCode: "NOT_CONFIGURED",
    };
  }
  if (!userId) return { ok: false, error: "Missing userId.", errorCode: "INVALID_INPUT" };
  if (!appName) return { ok: false, error: "Missing appName.", errorCode: "INVALID_INPUT" };

  const toolset = await getComposioToolset();
  if (!toolset) {
    return { ok: false, error: "Composio SDK not loaded.", errorCode: "NOT_CONFIGURED" };
  }

  const slug = appName.toLowerCase();

  try {
    const res = await toolset.client.connectedAccounts.initiate({
      entityId: userId,
      appName: slug,
      ...(redirectUri ? { redirectUri } : {}),
    });

    invalidateUserDiscovery(userId);

    console.log(
      `[Composio/Connections] initiate ok — userId=${userId} app=${slug} hasRedirect=${Boolean(res.redirectUrl)}`,
    );

    return {
      ok: true,
      redirectUrl: res.redirectUrl ?? null,
      connectionId: res.connectedAccountId,
    };
  } catch (err) {
    const e = err as { message?: string; status?: number; response?: { data?: unknown } } | Error;
    const message = e instanceof Error ? e.message : (e.message ?? "Unknown error");
    const responseData = (e as { response?: { data?: unknown } }).response?.data;

    // Server-side log: full error so devs can diagnose from Vercel/local logs.
    console.error("[Composio/Connections] initiate failed", {
      userId,
      app: slug,
      message,
      responseData,
    });

    // Map common Composio failure shapes to a stable errorCode the UI can act on.
    const lower = message.toLowerCase();
    let errorCode: InitiateConnectionResult["errorCode"] = "UPSTREAM_ERROR";
    if (/integration .*(not.*found|missing|unknown)/.test(lower) || /no integration/.test(lower)) {
      errorCode = "NO_INTEGRATION";
    } else if (/auth.*config|missing.*scope|client.*id|client.*secret/.test(lower)) {
      errorCode = "AUTH_CONFIG_REQUIRED";
    } else if (/not configured|api key|401|403/.test(lower)) {
      errorCode = "NOT_CONFIGURED";
    }

    return {
      ok: false,
      error: friendlyErrorMessage(slug, errorCode, message),
      errorCode,
      details: responseData ?? message,
    };
  }
}

function friendlyErrorMessage(
  slug: string,
  code: InitiateConnectionResult["errorCode"],
  rawMessage: string,
): string {
  switch (code) {
    case "NO_INTEGRATION":
      return `Aucune intégration ${slug} configurée sur ton compte Composio. Active-la sur https://app.composio.dev → Apps → ${slug} → Setup → "Use Composio Managed Auth", puis réessaye.`;
    case "AUTH_CONFIG_REQUIRED":
      return `L'intégration ${slug} demande une auth config (client ID/secret OAuth). Configure-la sur https://app.composio.dev → Apps → ${slug}.`;
    case "NOT_CONFIGURED":
      return `Composio n'est pas correctement configuré côté serveur (clé API ?). Vérifie COMPOSIO_API_KEY.`;
    case "INVALID_INPUT":
      return rawMessage;
    case "UPSTREAM_ERROR":
    default:
      return `Composio a refusé la connexion à ${slug} : ${rawMessage}`;
  }
}

/**
 * List the user's currently connected accounts. Filters out non-active
 * statuses by default — pass `{ includeInactive: true }` for the full set.
 */
export async function listConnections(
  userId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ConnectedAccount[]> {
  if (!isComposioConfigured() || !userId) return [];

  const toolset = await getComposioToolset();
  if (!toolset) return [];

  try {
    const raw = await toolset.client.connectedAccounts.list({
      user_uuid: userId,
      showActiveOnly: !opts.includeInactive,
    });
    const r = raw as ListResponse;
    const items = r.items ?? r.connectedAccounts ?? [];
    return items
      .map(normalizeAccount)
      .filter((a): a is ConnectedAccount => a !== null);
  } catch (err) {
    console.error(`[Composio/Connections] list failed for ${userId}:`, err);
    return [];
  }
}

/**
 * Disconnect one of the user's connections. Composio revokes the stored
 * credentials server-side.
 */
export async function disconnectAccount(
  userId: string,
  connectionId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isComposioConfigured() || !connectionId) {
    return { ok: false, error: "Composio not configured or missing connectionId." };
  }

  const toolset = await getComposioToolset();
  if (!toolset) return { ok: false, error: "Composio SDK not loaded." };

  try {
    await toolset.client.connectedAccounts.delete({ connectedAccountId: connectionId });
    invalidateUserDiscovery(userId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error disconnecting.",
    };
  }
}
