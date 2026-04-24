/**
 * User Connections API — Returns real connection status for all services
 *
 * This is the canonical source of truth for connector status in the UI.
 * It merges V1 auth (user_tokens) and V2 control-plane data.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUnifiedConnectors } from "@/lib/connectors/unified/reconcile";
import { getServiceDefinition } from "@/lib/integrations/catalog";
import { getProviderIdForService, getAllServiceIds } from "@/lib/integrations/service-map";
import type { ServiceWithConnectionStatus } from "@/lib/integrations/types";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "GET /api/v2/user/connections" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  try {
    // Get unified connector status from control-plane + auth — scoped to current user
    const connectors = await getUnifiedConnectors({
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
    });

    // Map connectors to service definitions
    const allServiceIds = getAllServiceIds();
    const services: ServiceWithConnectionStatus[] = [];

    for (const serviceId of allServiceIds) {
      const definition = getServiceDefinition(serviceId);
      if (!definition) continue;

      const providerId = getProviderIdForService(serviceId);
      if (!providerId) continue;

      // Find matching connector by provider
      const connector = connectors.find((c) => c.provider === providerId);

      // Map connector status to service status
      let connectionStatus: ServiceWithConnectionStatus["connectionStatus"] = "disconnected";
      let accountLabel: string | undefined;

      if (connector) {
        switch (connector.status) {
          case "connected":
            connectionStatus = "connected";
            accountLabel = connector.userId || connector.label;
            break;
          case "pending_auth":
            connectionStatus = "pending";
            break;
          case "degraded":
            connectionStatus = "error";
            break;
          case "disconnected":
          case "coming_soon":
          default:
            connectionStatus = "disconnected";
        }
      }

      services.push({
        ...definition,
        connectionStatus,
        accountLabel,
      });
    }

    // Log for debugging
    const connectedCount = services.filter((s) => s.connectionStatus === "connected").length;
    console.log(`[UserConnections] User ${scope.userId.slice(0, 8)}: ${connectedCount}/${services.length} connected`);

    return NextResponse.json({
      services,
      meta: {
        total: services.length,
        connected: connectedCount,
        timestamp: Date.now(),
        scope: { isDevFallback: scope.isDevFallback },
      },
    });
  } catch (error) {
    console.error("[UserConnections] Failed to fetch connections:", error);
    return NextResponse.json(
      { error: "internal_error", message: "Failed to fetch connections" },
      { status: 500 }
    );
  }
}
