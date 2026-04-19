import { NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { getUnifiedConnectors } from "@/lib/connectors/unified/reconcile";

export const dynamic = "force-dynamic";

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

export async function GET() {
  try {
    const userId = await getUserId();

    const connections = await getUnifiedConnectors({
      tenantId: DEV_TENANT_ID,
      workspaceId: DEV_WORKSPACE_ID,
      userId: userId ?? undefined,
    });

    return NextResponse.json({ connections });
  } catch (e) {
    console.error("GET /api/v2/connectors/unified: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
