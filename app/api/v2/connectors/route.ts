/**
 * @deprecated Raw control-plane connector list — no UI consumer.
 * Canonical endpoint: /api/v2/connectors/unified (reconciled view).
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

    return NextResponse.json({
      connections: connections.map((c) => ({
        id: c.id,
        provider: c.provider,
        displayName: c.displayName,
        status: c.status,
        capabilities: c.capabilities,
        updatedAt: c.updatedAt,
        lastCheckedAt: c.lastCheckedAt,
        lastError: c.lastError,
      })),
    });
  } catch (e) {
    console.error("GET /api/v2/connectors: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
