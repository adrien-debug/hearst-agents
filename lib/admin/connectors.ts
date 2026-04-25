/**
 * Admin Connectors API — Architecture Finale
 *
 * Connector management (enable/disable, configure).
 * Aligned with migration 0007 (integration_connections schema).
 * Tenant/user scope stored in `config` jsonb (same pattern as control-plane/store.ts).
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
  name: string;
  status: "active" | "inactive" | "revoked" | "error";
  authType: string;
  config: Record<string, unknown>;
  health: string | null;
  lastHealthCheck: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface UpdateConnectorStatusInput {
  enabled?: boolean;
}

export interface ConfigureConnectorInput {
  config: Record<string, unknown>;
  name?: string;
}

/**
 * List all available connectors (global registry via system_settings)
 */
export async function listConnectors(
  db: SupabaseClient,
  filters?: {
    enabled?: boolean;
  }
): Promise<ConnectorConfig[]> {
  const { data, error } = await db
    .from("system_settings")
    .select("*")
    .eq("category", "integrations")
    .like("key", "connector.%");

  if (error) {
    console.error("[Admin/Connectors] Failed to list connectors:", error.message);
    throw new Error(`Failed to list connectors: ${error.message}`);
  }

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

  let filtered = connectors;
  if (filters?.enabled !== undefined) {
    filtered = filtered.filter((c) => c.enabled === filters.enabled);
  }

  return filtered;
}

/**
 * Get connector instances (from integration_connections).
 * Tenant/user filtering uses the `config` jsonb field.
 */
export async function listConnectorInstances(
  db: SupabaseClient,
  tenantId?: string,
  userId?: string
): Promise<ConnectorInstance[]> {
  const { data, error } = await db
    .from("integration_connections")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[Admin/Connectors] Failed to list instances:", error.message);
    throw new Error(`Failed to list instances: ${error.message}`);
  }

  let instances = (data || []).map(mapRowToInstance);

  if (tenantId) {
    instances = instances.filter((i) => {
      const cfg = i.config as Record<string, unknown>;
      return cfg.tenantId === tenantId;
    });
  }

  if (userId) {
    instances = instances.filter((i) => {
      const cfg = i.config as Record<string, unknown>;
      return cfg.userId === userId;
    });
  }

  return instances;
}

/**
 * Update connector status (enable/disable at global registry level)
 */
export async function updateConnectorStatus(
  db: SupabaseClient,
  connectorId: string,
  enabled: boolean,
  updatedBy?: string
): Promise<void> {
  const key = `connector.${connectorId}`;

  const { data: existing } = await db
    .from("system_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  const currentValue = existing?.value
    ? parseConnectorValue(existing.value as string)
    : {};

  const { error } = await db
    .from("system_settings")
    .upsert(
      {
        key,
        value: JSON.stringify({ ...currentValue, enabled }),
        category: "integrations",
        updated_by: updatedBy,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key,tenant_id" }
    );

  if (error) {
    console.error("[Admin/Connectors] Failed to update status:", error.message);
    throw new Error(`Failed to update connector status: ${error.message}`);
  }
}

/**
 * Configure a connector instance (update config jsonb + name)
 */
export async function configureConnector(
  db: SupabaseClient,
  instanceId: string,
  input: ConfigureConnectorInput
): Promise<ConnectorInstance> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updatePayload: Record<string, any> = {
    config: input.config,
    updated_at: new Date().toISOString(),
  };
  if (input.name) {
    updatePayload.name = input.name;
  }

  const { data, error } = await db
    .from("integration_connections")
    .update(updatePayload)
    .eq("id", instanceId)
    .select()
    .single();

  if (error) {
    console.error("[Admin/Connectors] Failed to configure:", error.message);
    throw new Error(`Failed to configure connector: ${error.message}`);
  }

  return mapRowToInstance(data);
}

/**
 * Create a new connector instance.
 * Uses `inactive` as initial status (valid per CHECK constraint).
 */
export async function createConnectorInstance(
  db: SupabaseClient,
  input: {
    provider: string;
    name: string;
    tenantId: string;
    userId?: string;
    config?: Record<string, unknown>;
  }
): Promise<ConnectorInstance> {
  const { data, error } = await db
    .from("integration_connections")
    .insert({
      provider: input.provider,
      name: input.name,
      status: "inactive",
      auth_type: "oauth",
      config: {
        tenantId: input.tenantId,
        userId: input.userId,
        ...(input.config || {}),
      },
    })
    .select()
    .single();

  if (error) {
    console.error("[Admin/Connectors] Failed to create instance:", error.message);
    throw new Error(`Failed to create connector instance: ${error.message}`);
  }

  return mapRowToInstance(data);
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
    console.error("[Admin/Connectors] Failed to delete instance:", error.message);
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapRowToInstance(row: any): ConnectorInstance {
  return {
    id: row.id,
    connectorId: row.provider,
    name: row.name ?? row.provider,
    status: mapConnectionStatus(row.status),
    authType: row.auth_type ?? "oauth",
    config: row.config || {},
    health: row.health ?? null,
    lastHealthCheck: row.last_health_check ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapConnectionStatus(
  status: string
): ConnectorInstance["status"] {
  const validStatuses: ConnectorInstance["status"][] = [
    "active",
    "inactive",
    "revoked",
    "error",
  ];
  return validStatuses.includes(status as ConnectorInstance["status"])
    ? (status as ConnectorInstance["status"])
    : "inactive";
}
