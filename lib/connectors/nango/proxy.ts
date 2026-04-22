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
 * Build connection ID from user and provider
 * Format: hearst-{userId}-{provider}
 */
export function buildConnectionId(userId: string, provider: NangoProvider): string {
  // Normalize userId (remove special chars, limit length)
  const normalizedUserId = userId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);
  return `hearst-${normalizedUserId}-${provider}`;
}

/**
 * Parse connection ID to extract user and provider
 */
export function parseConnectionId(connectionId: string): { userId: string; provider: string } | null {
  const match = connectionId.match(/^hearst-(.+)-([a-z-]+)$/);
  if (!match) return null;
  return { userId: match[1], provider: match[2] };
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
export async function listUserConnections(userId: string): Promise<NangoProvider[]> {
  try {
    const nango = getNangoClient();
    // Nango list connections doesn't filter by user, we need to track in Supabase
    // This is a placeholder - actual implementation queries Supabase
    return [];
  } catch {
    return [];
  }
}
