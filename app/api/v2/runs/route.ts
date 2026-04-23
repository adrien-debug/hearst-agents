import { NextRequest, NextResponse } from "next/server";
import { getRuns } from "@/lib/runtime/state/adapter";
import { getAllRuns } from "@/lib/runtime/runs/store";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") ?? "50", 10),
      200,
    );

    // Canonical source: Supabase persistence
    const persisted = await getRuns({ limit });

    if (persisted.length > 0) {
      const runs = persisted.map((r) => ({
        id: r.id,
        input: r.input.slice(0, 200),
        surface: r.surface,
        executionMode: r.executionMode,
        agentId: r.agentId,
        backend: r.backend,
        missionId: r.missionId,
        status: r.status,
        createdAt: r.createdAt,
        completedAt: r.completedAt,
        assetCount: r.assets.length,
        metrics: r.metrics,
      }));

      return NextResponse.json({ runs });
    }

    // Fallback: in-memory store
    console.warn("[v2/runs] Persistent store empty — falling back to in-memory");
    const memRuns = getAllRuns(limit).map((r) => ({
      id: r.id,
      input: r.input.slice(0, 200),
      surface: r.surface,
      executionMode: r.executionMode,
      agentId: r.agentId,
      backend: r.backend,
      missionId: r.missionId,
      status: r.status,
      createdAt: r.createdAt,
      completedAt: r.completedAt,
      eventCount: r.events.length,
      assetCount: r.assets.length,
      metrics: r.metrics,
    }));

    return NextResponse.json({ runs: memRuns });
  } catch (e) {
    console.error("GET /api/v2/runs: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
