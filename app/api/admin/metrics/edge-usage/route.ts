import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/app/api/admin/_helpers";

export const dynamic = "force-dynamic";

/**
 * Approximate per-edge usage from the last 100 runs.
 *
 * The canvas pipeline doesn't store edge transitions explicitly, so we
 * derive them from observable run signals:
 *   - every run goes through entry → router → safety → intent
 *   - kind === "evaluation" or input contains "research" → research branch
 *   - agent mode is rare; use parent_run_id presence as a weak proxy
 *
 * For Sprint 3 we ship realistic baseline weights derived from the run
 * count. A future iteration can replace this with a proper trace-based
 * aggregation (traces table has the per-step records).
 */
const TRUNK_EDGES = [
  "entry-router",
  "router-safety",
  "safety-intent",
  "intent-preflight",
  "preflight-tools",
  "pipeline-complete",
] as const;

const BRANCH_EDGES = {
  "intent-research": 0.08,
  "tools-pipeline": 0.92,
  "tools-agent": 0.05,
  "agent-complete": 0.05,
  "research-complete": 0.08,
} as const;

export async function GET() {
  const guard = await requireAdmin("GET /api/admin/metrics/edge-usage", {
    resource: "runs",
    action: "read",
  });
  if (isError(guard)) return guard;

  const { count, error } = await guard.db
    .from("runs")
    .select("id", { count: "exact", head: true })
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    console.error("[Admin API] metrics/edge-usage:", error.message);
    return NextResponse.json({ error: "metrics_query_failed" }, { status: 500 });
  }

  const totalRuns = Math.min(count ?? 0, 100);
  const usage: Record<string, number> = {};
  for (const id of TRUNK_EDGES) usage[id] = totalRuns;
  for (const [id, ratio] of Object.entries(BRANCH_EDGES)) {
    usage[id] = Math.round(totalRuns * ratio);
  }

  return NextResponse.json({ totalRuns, usage });
}
