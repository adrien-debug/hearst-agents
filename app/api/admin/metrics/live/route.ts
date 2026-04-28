import { NextResponse } from "next/server";
import { requireAdmin, isError } from "@/app/api/admin/_helpers";

export const dynamic = "force-dynamic";

interface RunRow {
  status: string | null;
  latency_ms: number | null;
  created_at: string;
}

/**
 * Aggregate live KPIs from the `runs` table:
 *   - runsPerMin: count of runs created in the last 60 seconds.
 *   - p95LatencyMs: 95th percentile latency over the last 100 completed runs.
 *   - errorRate: failed / total over the last hour.
 *
 * The window is intentionally small (last 1h, capped at 1000 rows) so the
 * route stays cheap even when the runs table grows. Refreshed every 5s by the
 * AdminTopbar KPI strip.
 */
export async function GET() {
  const guard = await requireAdmin("GET /api/admin/metrics/live", {
    resource: "runs",
    action: "read",
  });
  if (isError(guard)) return guard;

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data, error } = await guard.db
    .from("runs")
    .select("status, latency_ms, created_at")
    .gte("created_at", oneHourAgo)
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) {
    console.error("[Admin API] metrics/live:", error.message);
    return NextResponse.json({ error: "metrics_query_failed" }, { status: 500 });
  }

  const rows = (data ?? []) as RunRow[];
  const oneMinAgo = Date.now() - 60 * 1000;
  const runsPerMin = rows.filter((r) => new Date(r.created_at).getTime() >= oneMinAgo).length;

  const failedCount = rows.filter((r) => r.status === "failed").length;
  const errorRate = rows.length === 0 ? 0 : failedCount / rows.length;

  const last100Latencies = rows
    .filter((r) => typeof r.latency_ms === "number" && r.latency_ms != null)
    .slice(0, 100)
    .map((r) => r.latency_ms as number)
    .sort((a, b) => a - b);
  const p95Index = Math.floor(last100Latencies.length * 0.95);
  const p95LatencyMs = last100Latencies[p95Index] ?? null;

  return NextResponse.json({
    runsPerMin,
    p95LatencyMs,
    errorRate,
    sampleSize: rows.length,
    windowSeconds: 3600,
  });
}
