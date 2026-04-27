import { NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getAllPlans } from "@/lib/engine/planner/store";

export const dynamic = "force-dynamic";

/**
 * GET /api/v2/plans
 * List all execution plans for the current user/tenant/workspace
 */
export async function GET() {
  const { scope, error } = await requireScope({ context: "GET /api/v2/plans" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  try {
    const allPlans = getAllPlans();
    
    // Filter by scope
    const plans = allPlans.filter((p) => {
      return (
        p.tenantId === scope.tenantId &&
        p.workspaceId === scope.workspaceId &&
        p.userId === scope.userId
      );
    });

    // Sort by most recent first
    const sorted = plans.sort((a, b) => b.updatedAt - a.updatedAt);

    return NextResponse.json({
      plans: sorted,
      count: sorted.length,
      scope: { isDevFallback: scope.isDevFallback },
    });
  } catch (e) {
    console.error("GET /api/v2/plans:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
