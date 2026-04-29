/**
 * GET /api/admin/llm-metrics — snapshot des métriques LLM en mémoire.
 *
 * Retourne le résultat de `defaultMetrics.getMetrics()` :
 * - Latence par provider (p50/p95/p99 sur les 100 derniers calls)
 * - Coût cumulé estimé
 * - Cache hit rate Anthropic
 * - Compteurs : circuit breaker trips, rate limit hits, tool loops
 *
 * RBAC : lecture sur `settings` (même garde que /api/admin/health).
 *
 * Note : ces métriques sont process-local. En multi-instance, agréger côté
 * observabilité externe (Datadog / OTel) en plus si besoin.
 */

import { NextResponse } from "next/server";
import { requireAdmin, isError } from "../_helpers";
import { getMetrics } from "@/lib/llm/metrics";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin("GET /api/admin/llm-metrics", {
    resource: "settings",
    action: "read",
  });
  if (isError(guard)) return guard;

  try {
    const snapshot = getMetrics();
    return NextResponse.json(snapshot, { status: 200 });
  } catch (e) {
    console.error("[Admin API] GET /llm-metrics error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
