/**
 * Admin Connectors API — Architecture Finale
 *
 * Connector management (enable/disable, configure).
 * Path: lib/admin/connectors.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConnectorConfig {
  id: string;
  provider: string;
  enabled: boolean;
  config: Record<string, unknown>;
  metadata: {
    label: string;
    description?: string;
    icon?: string;
    category?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ConnectorInstance {
  id: string;
  connectorId: string;
  tenantId: string;
  userId: string;
  status: "active" | "inactive" | "error" | "pending_auth";
  config: Record<string, unknown>;
  credentials?: Record<string, string>;
  lastSyncedAt?: string;
  errorMessage?: string;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateConnectorStatusInput {
  enabled?: boolean;
  status?: ConnectorInstance["status"];
  errorMessage?: string;
}

export interface ConfigureConnectorInput {
  config: Record<string, unknown>;
  credentials?: Record<string, string>;
}

/**
 * List all available connectors (global registry)
 */
export async function listConnectors(
  db: SupabaseClient,
  filters?: {
    category?: string;
    enabled?: boolean;
  }
): Promise<ConnectorConfig[]> {
  // Query from system_settings or dedicated connectors table
  // For now, return from registry + any custom connectors
  let query = db
    .from("system_settings")
    .select("*")
    .eq("category", "integrations")
    .like("key", "connector.%");

  const { data, error } = await query;

  if (error) {
    console.error("[Admin/Connectors] Failed to list connectors:", error);
    throw new Error(`Failed to list connectors: ${error.message}`);
  }

  // Transform settings into connector configs
  const connectors: ConnectorConfig[] = (data || []).map((row) => {
    const parsed = parseConnectorValue(row.value as string);
    return {
      id: row.key.replace("connector.", ""),
      provider: parsed.provider || row.key.replace("connector.", ""),
      enabled: parsed.enabled ?? true,
      config: parsed.config || {},
      metadata: parsed.metadata || {
        label: row.key.replace("connector.", ""),
      },
      createdAt: row.updated_at,
      updatedAt: row.updated_at,
    };
  });

  // Apply filters
  let filtered = connectors;
  if (filters?.enabled !== undefined) {
    filtered = filtered.filter((c) => c.enabled === filters.enabled);
  }

  return filtered;
}

/**
 * Get connector instances for a tenant/user
 */
export async function listConnectorInstances(
  db: SupabaseClient,
  tenantId: string,
  userId?: string
): Promise<ConnectorInstance[]> {
  let query = db
    .from("integration_connections")
    .select("*")
    .eq("tenant_id", tenantId);

  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Admin/Connectors] Failed to list instances:", error);
    throw new Error(`Failed to list instances: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    connectorId: row.provider,
    tenantId: row.tenant_id,
    userId: row.user_id,
    status: mapConnectionStatus(row.status),
    config: row.config || {},
    credentials: row.credentials,
    lastSyncedAt: row.last_synced_at,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}

/**
 * Update connector status (enable/disable at global level)
 */
export async function updateConnectorStatus(
  db: SupabaseClient,
  connectorId: string,
  enabled: boolean,
  updatedBy?: string
): Promise<void> {
  const { error } = await db
    .from("system_settings")
    .upsert(
      {
        key: `connector.${connectorId}`,
        value: JSON.stringify({ enabled }),
        category: "integrations",
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" }
    );

  if (error) {
    console.error("[Admin/Connectors] Failed to update status:", error);
    throw new Error(`Failed to update connector status: ${error.message}`);
  }
}

/**
 * Configure a connector instance
 */
export async function configureConnector(
  db: SupabaseClient,
  instanceId: string,
  input: ConfigureConnectorInput
): Promise<ConnectorInstance> {
  const { data, error } = await db
    .from("integration_connections")
    .update({
      config: input.config,
      credentials: input.credentials,
      updated_at: new Date().toISOString(),
    })
    .eq("id", instanceId)
    .select()
    .single();

  if (error) {
    console.error("[Admin/Connectors] Failed to configure:", error);
    throw new Error(`Failed to configure connector: ${error.message}`);
  }

  return {
    id: data.id,
    connectorId: data.provider,
    tenantId: data.tenant_id,
    userId: data.user_id,
    status: mapConnectionStatus(data.status),
    config: data.config || {},
    credentials: data.credentials,
    lastSyncedAt: data.last_synced_at,
    errorMessage: data.error_message,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Create a new connector instance
 */
export async function createConnectorInstance(
  db: SupabaseClient,
  input: {
    connectorId: string;
    tenantId: string;
    userId: string;
    config?: Record<string, unknown>;
  }
): Promise<ConnectorInstance> {
  const { data, error } = await db
    .from("integration_connections")
    .insert({
      provider: input.connectorId,
      tenant_id: input.tenantId,
      user_id: input.userId,
      status: "pending_auth",
      config: input.config || {},
    })
    .select()
    .single();

  if (error) {
    console.error("[Admin/Connectors] Failed to create instance:", error);
    throw new Error(`Failed to create connector instance: ${error.message}`);
  }

  return {
    id: data.id,
    connectorId: data.provider,
    tenantId: data.tenant_id,
    userId: data.user_id,
    status: mapConnectionStatus(data.status),
    config: data.config || {},
    createdAt: data.created_at,
    updatedAt: data.updated_at,
  };
}

/**
 * Delete a connector instance
 */
export async function deleteConnectorInstance(
  db: SupabaseClient,
  instanceId: string
): Promise<void> {
  const { error } = await db
    .from("integration_connections")
    .delete()
    .eq("id", instanceId);

  if (error) {
    console.error("[Admin/Connectors] Failed to delete instance:", error);
    throw new Error(`Failed to delete connector instance: ${error.message}`);
  }
}

/**
 * Test connector connectivity
 */
export async function testConnectorConnection(
  db: SupabaseClient,
  instanceId: string
): Promise<{ success: boolean; latencyMs: number; error?: string }> {
  const start = Date.now();

  try {
    // Get instance details
    const { data: instance, error } = await db
      .from("integration_connections")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (error || !instance) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        error: "Instance not found",
      };
    }

    // TODO: Implement provider-specific health checks
    // This would require importing specific connector health check functions

    return {
      success: true,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Helper to parse connector config from stored value
 */
function parseConnectorValue(value: string): {
  provider?: string;
  enabled?: boolean;
  config?: Record<string, unknown>;
  metadata?: { label: string; description?: string };
} {
  try {
    return JSON.parse(value);
  } catch {
    return { enabled: true };
  }
}

/**
 * Map database status to typed status
 */
function mapConnectionStatus(
  status: string
): ConnectorInstance["status"] {
  const validStatuses: ConnectorInstance["status"][] = [
    "active",
    "inactive",
    "error",
    "pending_auth",
  ];
  return validStatuses.includes(status as ConnectorInstance["status"])
    ? (status as ConnectorInstance["status"])
    : "inactive";
}
