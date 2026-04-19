/**
 * Connector Control Plane — auto-registration helpers.
 *
 * Called at provider selection/execution points to ensure
 * a canonical connection record exists for the current tenant.
 */

import { randomUUID } from "crypto";
import type { TenantScope } from "@/lib/multi-tenant/types";
import type { ConnectorConnection } from "./types";
import { getProviderCapabilities } from "./provider-capabilities";
import { upsertConnection, updateConnectionStatus } from "./store";
import { getConnector } from "@/lib/connectors/platform/registry";

export async function registerProviderUsage(input: {
  provider: string;
  scope: TenantScope;
}): Promise<void> {
  const def = getConnector(input.provider);
  const now = Date.now();

  const connection: ConnectorConnection = {
    id: randomUUID(),
    provider: input.provider,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    userId: input.scope.userId,
    capabilities: getProviderCapabilities(input.provider),
    status: "connected",
    displayName: def?.label ?? input.provider,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
  };

  await upsertConnection(connection);
}

export async function markProviderDegraded(input: {
  provider: string;
  scope: TenantScope;
  error: string;
}): Promise<void> {
  await updateConnectionStatus({
    provider: input.provider,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    userId: input.scope.userId,
    status: "degraded",
    lastCheckedAt: Date.now(),
    lastError: input.error,
  });
}
