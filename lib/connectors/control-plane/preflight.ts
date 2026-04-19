/**
 * Connector Control Plane — preflight checks.
 *
 * Uses unified connector truth (auth + control-plane reconciled)
 * to avoid false negatives when auth exists but control-plane is stale.
 */

import type { TenantScope } from "@/lib/multi-tenant/types";
import type { ConnectorPreflightResult } from "./types";
import { isProviderConnected } from "../unified/reconcile";
import { getConnectionByProvider } from "./store";

export async function preflightConnector(input: {
  provider: string;
  scope: TenantScope;
  userId?: string;
}): Promise<ConnectorPreflightResult> {
  const connected = await isProviderConnected({
    provider: input.provider,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    userId: input.userId ?? input.scope.userId,
  });

  if (connected) {
    return { ok: true, provider: input.provider, status: "connected" };
  }

  const connection = await getConnectionByProvider({
    provider: input.provider,
    tenantId: input.scope.tenantId,
    workspaceId: input.scope.workspaceId,
    userId: input.userId,
  });

  return {
    ok: false,
    provider: input.provider,
    status: connection?.status ?? "disconnected",
    reason: connection?.lastError ?? "Provider is not connected",
  };
}
