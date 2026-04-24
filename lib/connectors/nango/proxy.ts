/**
 * Nango Proxy — API calls through Nango for 200+ providers
 *
 * Routes API requests to any connected provider via Nango's proxy,
 * handling auth, retries, and rate limiting automatically.
 */

import { getNangoClient } from "./client";
import type { NangoProxyRequest, NangoProxyResponse, NangoProvider } from "./types";

export interface ProxyOptions {
  userId: string;
  tenantId?: string;
  timeoutMs?: number;
  retries?: number;
}

/**
 * Execute API call through Nango proxy
 */
export async function nangoProxy<T = unknown>(
  request: NangoProxyRequest,
  options: ProxyOptions
): Promise<NangoProxyResponse<T>> {
  const nango = getNangoClient();
  const connectionId = buildConnectionId(options.userId, request.provider);

  const startTime = Date.now();

  try {
    const response = await nango.proxy({
      method: request.method || "GET",
      endpoint: request.endpoint,
      providerConfigKey: request.provider,
      connectionId,
      data: request.data,
      headers: request.headers,
      retries: options.retries || 3,
    });

    const latency = Date.now() - startTime;

    console.log(`[NangoProxy] ${request.provider} ${request.method || "GET"} ${request.endpoint} — ${latency}ms`);

    return {
      data: response.data as T,
      status: response.status,
      headers: response.headers as Record<string, string>,
    };
  } catch (error) {
    const latency = Date.now() - startTime;
    console.error(`[NangoProxy] ${request.provider} ${request.endpoint} failed (${latency}ms):`, error);
    throw error;
  }
}

/**
 * Build connection ID from user and provider.
 *
 * Canonical format: `hearstx-{hex(userId)}-{provider}`
 *
 * The userId (= canonical email coming from NextAuth — Google/Outlook) is
 * hex-encoded so the OAuth callback can recover the FULL email lossless via
 * `parseConnectionId`. Hex uses `[0-9a-f]` exclusively, so the regex parser
 * has no ambiguity with the provider segment.
 *
 * The legacy format `hearst-{normalizedUserId}-{provider}` is kept understood
 * by `parseConnectionId` for backward compatibility, but new connections never
 * use it — it normalized + truncated the userId to 20 chars, which broke the
 * link between the persisted `integration_connections.user_id` and the canonical
 * email.
 */
export function buildConnectionId(userId: string, provider: NangoProvider): string {
  const hexUserId = Buffer.from(userId, "utf8").toString("hex");
  return `hearstx-${hexUserId}-${provider}`;
}

/**
 * Parse connection ID to extract user and provider.
 *
 * Tries the canonical hex-encoded format first, then falls back to the legacy
 * `hearst-…` format so OAuth callbacks initiated before the rollout still
 * resolve (with the previous truncated userId — connection just needs to be
 * re-established to recover the canonical email).
 */
export function parseConnectionId(connectionId: string): { userId: string; provider: string } | null {
  const canonical = connectionId.match(/^hearstx-([a-f0-9]+)-([a-z0-9-]+)$/);
  if (canonical) {
    try {
      const decoded = Buffer.from(canonical[1], "hex").toString("utf8");
      if (decoded.length > 0) return { userId: decoded, provider: canonical[2] };
    } catch {
      // fall through to legacy
    }
  }
  const legacy = connectionId.match(/^hearst-(.+)-([a-z-]+)$/);
  if (legacy) return { userId: legacy[1], provider: legacy[2] };
  return null;
}

/**
 * Check if a connection exists and is active
 */
export async function checkConnection(
  userId: string,
  provider: NangoProvider
): Promise<boolean> {
  try {
    const nango = getNangoClient();
    const connectionId = buildConnectionId(userId, provider);

    const connection = await nango.getConnection(provider, connectionId);
    // Connection exists if we got a response without error
    return !!connection;
  } catch {
    return false;
  }
}

/**
 * Get list of active connections for a user
 */
export async function listUserConnections(_userId: string): Promise<NangoProvider[]> {
  try {
    // Nango list connections doesn't filter by user, we need to track in Supabase
    // This is a placeholder - actual implementation queries Supabase
    return [];
  } catch {
    return [];
  }
}
