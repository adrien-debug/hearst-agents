/**
 * Admin Connectors API — Architecture Finale
 *
 * Connector management (enable/disable, configure).
 * Path: lib/admin/connectors.ts
 * Status: Stub — Implementation pending
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ConnectorConfig {
  id: string;
  enabled: boolean;
  config: Record<string, unknown>;
  updatedAt: string;
}

export async function listConnectors(
  db: SupabaseClient,
  tenantId?: string
): Promise<ConnectorConfig[]> {
  // TODO: Implement connector listing
  console.log("[Admin/Connectors] listConnectors tenantId=", tenantId);
  return [];
}

export async function updateConnectorStatus(
  db: SupabaseClient,
  connectorId: string,
  enabled: boolean,
  tenantId?: string
): Promise<void> {
  // TODO: Implement status update
  console.log("[Admin/Connectors] updateConnectorStatus id=", connectorId, "enabled=", enabled);
}

export async function configureConnector(
  db: SupabaseClient,
  connectorId: string,
  config: Record<string, unknown>,
  tenantId?: string
): Promise<void> {
  // TODO: Implement configuration
  console.log("[Admin/Connectors] configureConnector id=", connectorId);
}
