/**
 * Unified Connector Truth — canonical types.
 *
 * Reconciles V1 auth truth (user_tokens) and V2 control-plane
 * (integration_connections) into one trustworthy model.
 */

export type UnifiedConnectorStatus =
  | "connected"
  | "degraded"
  | "disconnected"
  | "pending_auth"
  | "coming_soon";

export interface UnifiedConnectorRecord {
  provider: string;
  label: string;
  tenantId?: string;
  workspaceId?: string;
  userId?: string;

  authConnected: boolean;
  controlPlaneConnected: boolean;

  status: UnifiedConnectorStatus;
  capabilities: string[];

  canConnect: boolean;

  lastCheckedAt?: number;
  lastError?: string;

  source: {
    auth: "present" | "missing";
    controlPlane: "present" | "missing";
  };

  isDiverged: boolean;
  reconciliationNote?: string;
}
