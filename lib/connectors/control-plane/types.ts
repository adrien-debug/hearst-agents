/**
 * Connector Control Plane — canonical connection types.
 *
 * All tenant-scoped connector connections are modeled here.
 * No provider execution should happen without an explicit connection record.
 */

import type { ConnectorCapability } from "@/lib/connectors/platform/types";

export type ConnectorStatus =
  | "connected"
  | "disconnected"
  | "degraded"
  | "error"
  | "pending_auth";

export interface ConnectorConnection {
  id: string;
  provider: string;
  tenantId: string;
  workspaceId: string;
  userId?: string;

  capabilities: ConnectorCapability[];

  status: ConnectorStatus;
  displayName: string;

  connectionKey?: string;
  externalAccountId?: string;

  createdAt: number;
  updatedAt: number;
  lastCheckedAt?: number;
  lastError?: string;
}

export interface ConnectorPreflightResult {
  ok: boolean;
  provider: string;
  status: ConnectorStatus;
  reason?: string;
}

export interface ConnectorHealthSummary {
  healthy: number;
  degraded: number;
  disconnected: number;
}
