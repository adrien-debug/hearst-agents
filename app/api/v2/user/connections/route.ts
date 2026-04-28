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
import { requireScope } from "@/lib/platform/auth/scope";
import {
  isComposioConfigured,
  listConnections,
  listAvailableApps,
} from "@/lib/connectors/composio";
import { getApplicableReports } from "@/lib/reports/catalog";

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

    // ── Composio bridge ─────────────────────────────────────
    // Composio is a parallel source of truth: a user can connect Slack,
    // Notion, Linear, … via the /apps page and those connections live
    // only at Composio. Without this merge the LeftPanel rail and any
    // other consumer of this endpoint would never see them.
    //
    // For each connected Composio account we either (a) upgrade the
    // existing service entry to "connected" if its slug matches our
    // static service-map, or (b) synthesize a ServiceWithConnectionStatus
    // on the fly using the Composio toolkit catalog for icon + name.
    if (isComposioConfigured()) {
      try {
        const [composioAccounts, composioApps] = await Promise.all([
          listConnections(scope.userId, { includeInactive: false }),
          listAvailableApps(),
        ]);
        const appBySlug = new Map(composioApps.map((a) => [a.key, a]));
        const knownSlugs = new Set(services.map((s) => s.id));

        const statusFromComposio = (
          composioStatus: string,
        ): ServiceWithConnectionStatus["connectionStatus"] => {
          if (composioStatus === "ACTIVE") return "connected";
          if (composioStatus === "INITIATED") return "pending";
          // EXPIRED / FAILED → surface as `error` so the UI shows a
          // reconnect affordance instead of pretending nothing exists.
          return "error";
        };

        for (const account of composioAccounts) {
          const slug = account.appName;
          if (!slug) continue;
          const composioStatus = statusFromComposio(account.status);

          const existing = services.find((s) => s.id === slug);
          if (existing) {
            // Composio is the authoritative source for slugs it tracks:
            // upgrade `connected`, downgrade to `error` for expired tokens.
            if (composioStatus === "connected" && existing.connectionStatus !== "connected") {
              existing.connectionStatus = "connected";
              existing.accountLabel = existing.accountLabel ?? "Composio";
            } else if (composioStatus === "error" && existing.connectionStatus === "disconnected") {
              existing.connectionStatus = "error";
              existing.accountLabel = "Composio (reconnect)";
            }
            continue;
          }

          if (!knownSlugs.has(slug)) {
            const meta = appBySlug.get(slug);
            services.push({
              id: slug,
              name: meta?.name ?? slug,
              description: meta?.description ?? `Connected via Composio`,
              icon: meta?.logo ?? "",
              category: meta?.categories[0] ?? "other",
              tier: "tier_2",
              type: "hybrid",
              status: "active",
              providerId: slug,
              capabilities: [],
              isConnectable: true,
              connectionStatus: composioStatus,
              accountLabel:
                composioStatus === "error" ? "Composio (reconnect)" : "Composio",
            });
            knownSlugs.add(slug);
          }
        }
      } catch (err) {
        console.error("[UserConnections] Composio merge failed:", err);
        // Non-fatal — return whatever we have without Composio data.
      }
    }

    // Log for debugging
    const connectedCount = services.filter((s) => s.connectionStatus === "connected").length;
    console.log(`[UserConnections] User ${scope.userId.slice(0, 8)}: ${connectedCount}/${services.length} connected`);

    // Reports applicables au user vu ses connexions (ready/partial seulement).
    // Le RightPanel les transforme en suggestions dans la section Assets.
    const connectedSlugs = services
      .filter((s) => s.connectionStatus === "connected")
      .map((s) => s.id);
    const applicableReports = getApplicableReports(connectedSlugs);

    return NextResponse.json({
      services,
      applicableReports,
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
