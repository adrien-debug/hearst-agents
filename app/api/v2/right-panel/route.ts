/**
 * Canonical UI data source — Right Panel.
 * All new UI components must use this endpoint for runs, assets, and missions.
 */
import { NextRequest, NextResponse } from "next/server";
import { buildRightPanelData } from "@/lib/ui/right-panel/aggregate";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "GET /api/v2/right-panel" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  try {
    const threadId = req.nextUrl.searchParams.get("thread_id") ?? undefined;

    // Build right panel data scoped to current user
    // The aggregate function should filter data by user/tenant/workspace
    const data = await buildRightPanelData(threadId, {
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });

    return NextResponse.json({ ...data, scope: { isDevFallback: scope.isDevFallback } });
  } catch (e) {
    console.error("GET /api/v2/right-panel: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
