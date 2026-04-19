/**
 * Connector Health — tenant-scoped health tracking contract.
 *
 * Contract for monitoring 200+ services safely per tenant.
 * No heavy implementation yet — structure only.
 */

export interface ConnectorHealthRecord {
  provider: string;
  tenantId: string;
  workspaceId: string;
  status: "healthy" | "degraded" | "disconnected";
  checkedAt: number;
  error?: string;
}
