/**
 * @deprecated Connector health summary — no UI consumer.
 * Health data is included in /api/v2/connectors/unified and /api/v2/right-panel.
 */
import { NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { getConnectionsByScope } from "@/lib/connectors/control-plane/store";

export const dynamic = "force-dynamic";

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

export async function GET() {
  try {
    const userId = await getUserId();

    const connections = await getConnectionsByScope({
      tenantId: DEV_TENANT_ID,
      workspaceId: DEV_WORKSPACE_ID,
      userId: userId ?? undefined,
    });

    const healthy = connections.filter((c) => c.status === "connected").length;
    const degraded = connections.filter((c) => c.status === "degraded" || c.status === "error").length;
    const disconnected = connections.filter((c) => c.status === "disconnected" || c.status === "pending_auth").length;

    return NextResponse.json({
      healthy,
      degraded,
      disconnected,
      connections: connections.map((c) => ({
        provider: c.provider,
        displayName: c.displayName,
        status: c.status,
        lastCheckedAt: c.lastCheckedAt,
        lastError: c.lastError,
      })),
    });
  } catch (e) {
    console.error("GET /api/v2/connectors/health: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
