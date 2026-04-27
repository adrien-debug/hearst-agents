/**
 * Composio Connections — manage a user's connected third-party accounts.
 *
 * Built on the new `@composio/core` v0.6 surface:
 *  - `composio.toolkits.authorize(userId, toolkitSlug)` opens the OAuth
 *    flow and returns `{ id, redirectUrl }`. We wrap that for callers.
 *  - `composio.connectedAccounts.list({ userIds })` lists this user's
 *    connections — server-side scoping = no cross-tenant leak.
 *  - `composio.connectedAccounts.delete(nanoid)` revokes one connection.
 *
 * `userId` (Hearst Supabase id) maps 1:1 onto Composio's `userId`.
 */

import { getComposio, isComposioConfigured } from "./client";
import { invalidateUserDiscovery } from "./discovery";

export interface ConnectedAccount {
  id: string;
  appName: string;
  status: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface InitiateConnectionResult {
  ok: boolean;
  redirectUrl?: string | null;
  connectionId?: string;
  error?: string;
  errorCode?:
    | "NOT_CONFIGURED"
    | "NO_INTEGRATION"
    | "AUTH_CONFIG_REQUIRED"
    | "INVALID_INPUT"
    | "UPSTREAM_ERROR"
    | "UNKNOWN";
  details?: unknown;
}

interface RawConnectedAccount {
  id?: string;
  nanoid?: string;
  toolkit?: { slug?: string } | string;
  appName?: string;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
  created_at?: string;
  updated_at?: string;
}

interface ListResponse {
  items?: RawConnectedAccount[];
}

function normalizeAccount(raw: RawConnectedAccount): ConnectedAccount | null {
  const id = raw.id ?? raw.nanoid;
  if (!id) return null;
  const slug =
    typeof raw.toolkit === "object" && raw.toolkit
      ? (raw.toolkit.slug ?? "")
      : (typeof raw.toolkit === "string" ? raw.toolkit : (raw.appName ?? ""));
  return {
    id,
    appName: slug.toLowerCase(),
    status: raw.status ?? "INACTIVE",
    createdAt: raw.createdAt ?? raw.created_at,
    updatedAt: raw.updatedAt ?? raw.updated_at,
  };
}

export async function initiateConnection(
  userId: string,
  appName: string,
  redirectUri?: string,
): Promise<InitiateConnectionResult> {
  if (!isComposioConfigured()) {
    return { ok: false, error: "COMPOSIO_API_KEY not configured.", errorCode: "NOT_CONFIGURED" };
  }
  if (!userId) return { ok: false, error: "Missing userId.", errorCode: "INVALID_INPUT" };
  if (!appName) return { ok: false, error: "Missing appName.", errorCode: "INVALID_INPUT" };

  const composio = await getComposio();
  if (!composio) {
    return { ok: false, error: "Composio SDK not loaded.", errorCode: "NOT_CONFIGURED" };
  }

  const slug = appName.toLowerCase();

  try {
    // `authorize(userId, toolkitSlug)` resolves the default auth config for
    // the toolkit and creates a connection request — exactly the one-call
    // flow the OpenAIToolSet `initiate` provided in the legacy SDK, but
    // without us having to know the auth-config nanoid.
    const res = await composio.toolkits.authorize(userId, slug);
    invalidateUserDiscovery(userId);

    console.log(
      `[Composio/Connections] authorize ok — userId=${userId} toolkit=${slug} hasRedirect=${Boolean(res.redirectUrl)}`,
    );

    void redirectUri; // Composio Connect URLs handle return-to via dashboard config.

    return {
      ok: true,
      redirectUrl: res.redirectUrl ?? null,
      connectionId: res.id,
    };
  } catch (err) {
    const e = err as { message?: string; status?: number; response?: { data?: unknown } } | Error;
    const message = e instanceof Error ? e.message : (e.message ?? "Unknown error");
    const responseData = (e as { response?: { data?: unknown } }).response?.data;

    console.error("[Composio/Connections] authorize failed", {
      userId,
      toolkit: slug,
      message,
      responseData,
    });

    const lower = message.toLowerCase();
    let errorCode: InitiateConnectionResult["errorCode"] = "UPSTREAM_ERROR";
    if (
      /auth.*config.*not.*found/.test(lower) ||
      /no.*auth.*config/.test(lower) ||
      /toolkit.*not.*found/.test(lower)
    ) {
      errorCode = "NO_INTEGRATION";
    } else if (/auth.*config.*required|missing.*scope|client.*id|client.*secret/.test(lower)) {
      errorCode = "AUTH_CONFIG_REQUIRED";
    } else if (/api key|401|403/.test(lower)) {
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
      return `Aucune intégration ${slug} configurée sur ton compte Composio. Active-la sur https://app.composio.dev → Toolkits → ${slug} → "Setup" → "Use Composio Managed Auth", puis réessaye.`;
    case "AUTH_CONFIG_REQUIRED":
      return `L'intégration ${slug} demande une auth config (client ID/secret OAuth). Configure-la sur https://app.composio.dev → Toolkits → ${slug}.`;
    case "NOT_CONFIGURED":
      return `Composio n'est pas correctement configuré (clé API ?). Vérifie COMPOSIO_API_KEY (format ak_…).`;
    case "INVALID_INPUT":
      return rawMessage;
    case "UPSTREAM_ERROR":
    default:
      return `Composio a refusé la connexion à ${slug} : ${rawMessage}`;
  }
}

export async function listConnections(
  userId: string,
  opts: { includeInactive?: boolean } = {},
): Promise<ConnectedAccount[]> {
  if (!isComposioConfigured() || !userId) return [];
  const composio = await getComposio();
  if (!composio) return [];

  try {
    // We pull *all* statuses by default so the UI can flag EXPIRED /
    // FAILED connections as "needs reconnect" instead of hiding them
    // (which made the user think they were never connected at all).
    // `includeInactive: false` still drops fully terminal states.
    const raw = (await composio.connectedAccounts.list({
      userIds: [userId],
      ...(opts.includeInactive
        ? {}
        : { statuses: ["ACTIVE", "INITIATED", "EXPIRED", "FAILED"] }),
    })) as ListResponse;
    const items = raw.items ?? [];
    return items
      .map(normalizeAccount)
      .filter((a): a is ConnectedAccount => a !== null);
  } catch (err) {
    console.error(`[Composio/Connections] list failed for ${userId}:`, err);
    return [];
  }
}

export async function disconnectAccount(
  userId: string,
  connectionId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!isComposioConfigured() || !connectionId) {
    return { ok: false, error: "Composio not configured or missing connectionId." };
  }
  const composio = await getComposio();
  if (!composio) return { ok: false, error: "Composio SDK not loaded." };

  try {
    await composio.connectedAccounts.delete(connectionId);
    invalidateUserDiscovery(userId);
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error disconnecting.",
    };
  }
}
