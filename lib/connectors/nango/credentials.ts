/**
 * Nango Credentials Sync
 *
 * Syncs Nango connection status with HEARST's Supabase.
 * We don't store tokens (Nango handles that), only references.
 */

import { createClient } from "@supabase/supabase-js";
import type { NangoConnectionRecord, NangoProvider } from "./types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export interface SyncConnectionInput {
  userId: string;
  tenantId: string;
  provider: NangoProvider;
  nangoConnectionId: string;
  status: "active" | "error" | "revoked";
  metadata?: Record<string, unknown>;
}

export async function syncNangoConnection(
  input: SyncConnectionInput
): Promise<NangoConnectionRecord> {
  const { data, error } = await supabase
    .from("integration_connections")
    .upsert({
      user_id: input.userId,
      tenant_id: input.tenantId,
      provider: input.provider,
      nango_connection_id: input.nangoConnectionId,
      status: input.status,
      metadata: input.metadata || {},
      updated_at: new Date().toISOString(),
    }, {
      onConflict: "user_id,provider",
    })
    .select()
    .single();

  if (error) {
    console.error("[NangoSync] Failed to sync connection:", error);
    throw new Error(`Failed to sync connection: ${error.message}`);
  }

  return {
    id: data.id,
    user_id: data.user_id,
    tenant_id: data.tenant_id,
    provider: data.provider as NangoProvider,
    nango_connection_id: data.nango_connection_id,
    status: data.status as "active" | "error" | "revoked",
    created_at: data.created_at,
    updated_at: data.updated_at,
    metadata: data.metadata as Record<string, unknown> | undefined,
  };
}

export async function removeConnection(
  userId: string,
  provider: NangoProvider
): Promise<void> {
  const { error } = await supabase
    .from("integration_connections")
    .delete()
    .eq("user_id", userId)
    .eq("provider", provider);

  if (error) {
    console.error("[NangoSync] Failed to remove connection:", error);
    throw new Error(`Failed to remove connection: ${error.message}`);
  }
}

export async function getConnectionRecord(
  userId: string,
  provider: NangoProvider
): Promise<NangoConnectionRecord | null> {
  const { data, error } = await supabase
    .from("integration_connections")
    .select()
    .eq("user_id", userId)
    .eq("provider", provider)
    .single();

  if (error || !data) return null;

  return {
    id: data.id,
    user_id: data.user_id,
    tenant_id: data.tenant_id,
    provider: data.provider as NangoProvider,
    nango_connection_id: data.nango_connection_id,
    status: data.status as "active" | "error" | "revoked",
    created_at: data.created_at,
    updated_at: data.updated_at,
    metadata: data.metadata as Record<string, unknown> | undefined,
  };
}

export async function listActiveConnections(
  userId: string
): Promise<NangoConnectionRecord[]> {
  const { data, error } = await supabase
    .from("integration_connections")
    .select()
    .eq("user_id", userId)
    .eq("status", "active");

  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    user_id: row.user_id,
    tenant_id: row.tenant_id,
    provider: row.provider as NangoProvider,
    nango_connection_id: row.nango_connection_id,
    status: row.status as "active" | "error" | "revoked",
    created_at: row.created_at,
    updated_at: row.updated_at,
    metadata: row.metadata as Record<string, unknown> | undefined,
  }));
}
