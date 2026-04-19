/**
 * Connector Tenant Contract — all connectors must execute within an explicit scope.
 *
 * No connector should ever run "globally". Every execution context must carry
 * tenantId, workspaceId, and provider at minimum.
 */

export interface ConnectorExecutionContext {
  tenantId: string;
  workspaceId: string;
  userId?: string;
  provider: string;
  connectionId?: string;
}

export function assertConnectorContext(
  ctx: Partial<ConnectorExecutionContext>,
): asserts ctx is ConnectorExecutionContext {
  if (!ctx?.tenantId || !ctx?.workspaceId || !ctx?.provider) {
    throw new Error(
      "Missing connector execution context (tenantId + workspaceId + provider required)",
    );
  }
}
