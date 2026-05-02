/**
 * Connector Control Plane — connection store.
 *
 * Persists tenant-scoped connection records using the existing
 * `integration_connections` table with tenant scope in `config` jsonb.
 * Falls back to in-memory for resilience.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { ConnectorConnection } from "./types";
import { getProviderCapabilities } from "./provider-capabilities";

let _client: SupabaseClient | null = null;

function db(): SupabaseClient | null {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  _client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _client;
}

// ── In-memory fallback ─────────────────────────────────────

const memoryStore: Map<string, ConnectorConnection> = new Map();

function connectionKey(provider: string, tenantId: string, workspaceId: string, userId?: string): string {
  return `${tenantId}:${workspaceId}:${provider}${userId ? `:${userId}` : ""}`;
}

// ── Writes ─────────────────────────────────────────────────

export async function upsertConnection(
  connection: ConnectorConnection,
): Promise<void> {
  const key = connectionKey(connection.provider, connection.tenantId, connection.workspaceId, connection.userId);
  memoryStore.set(key, connection);

  const sb = db();
  if (!sb) return;

  try {
    await sb.from("integration_connections").upsert(
      {
        id: connection.id,
        provider: connection.provider,
        name: connection.displayName,
        status: connection.status,
        health: connection.status === "connected" ? "healthy" : connection.status,
        auth_type: "oauth",
        last_health_check: connection.lastCheckedAt
          ? new Date(connection.lastCheckedAt).toISOString()
          : null,
        config: {
          tenantId: connection.tenantId,
          workspaceId: connection.workspaceId,
          userId: connection.userId,
          capabilities: connection.capabilities,
          connectionKey: connection.connectionKey,
          externalAccountId: connection.externalAccountId,
          lastError: connection.lastError,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
  } catch (err) {
    console.error("[ControlPlane] upsertConnection error:", err);
  }
}

// ── Reads ──────────────────────────────────────────────────

export async function getConnectionsByScope(input: {
  tenantId: string;
  workspaceId: string;
  userId?: string;
}): Promise<ConnectorConnection[]> {
  // Try in-memory first (fastest for active connections)
  const memResults = Array.from(memoryStore.values()).filter(
    (c) =>
      c.tenantId === input.tenantId &&
      c.workspaceId === input.workspaceId &&
      (!input.userId || c.userId === input.userId),
  );
  if (memResults.length > 0) return memResults;

  // Fall back to DB
  const sb = db();
  if (!sb) return [];

  try {
    const { data, error } = await sb
      .from("integration_connections")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error || !data) return [];

    return data
      .filter((row) => {
        const cfg = (row.config ?? {}) as Record<string, unknown>;
        return cfg.tenantId === input.tenantId && cfg.workspaceId === input.workspaceId;
      })
      .map(toConnection);
  } catch {
    return [];
  }
}

export async function getConnectionByProvider(input: {
  provider: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;
}): Promise<ConnectorConnection | null> {
  const key = connectionKey(input.provider, input.tenantId, input.workspaceId, input.userId);
  const mem = memoryStore.get(key);
  if (mem) return mem;

  const sb = db();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from("integration_connections")
      .select("*")
      .eq("provider", input.provider)
      .limit(10);

    if (error || !data) return null;

    const match = data.find((row) => {
      const cfg = (row.config ?? {}) as Record<string, unknown>;
      return cfg.tenantId === input.tenantId && cfg.workspaceId === input.workspaceId;
    });

    if (!match) return null;

    const conn = toConnection(match);
    memoryStore.set(key, conn);
    return conn;
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toConnection(row: any): ConnectorConnection {
  const cfg = (row.config ?? {}) as Record<string, unknown>;
  return {
    id: row.id,
    provider: row.provider,
    tenantId: (cfg.tenantId as string) ?? "",
    workspaceId: (cfg.workspaceId as string) ?? "",
    userId: cfg.userId as string | undefined,
    capabilities: (cfg.capabilities as ConnectorConnection["capabilities"]) ?? getProviderCapabilities(row.provider),
    status: row.status as ConnectorConnection["status"],
    displayName: row.name ?? row.provider,
    connectionKey: cfg.connectionKey as string | undefined,
    externalAccountId: cfg.externalAccountId as string | undefined,
    createdAt: new Date(row.created_at).getTime(),
    updatedAt: new Date(row.updated_at).getTime(),
    lastCheckedAt: row.last_health_check ? new Date(row.last_health_check).getTime() : undefined,
    lastError: cfg.lastError as string | undefined,
  };
}
