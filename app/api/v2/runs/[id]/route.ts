import { NextRequest, NextResponse } from "next/server";
import { getRunById as getPersistedRun } from "@/lib/runtime/state/adapter";
import { getRunById } from "@/lib/runtime/runs/store";
import { normalizeRunEventsToTimeline } from "@/lib/runtime/timeline/normalize";
import { getPersistedRunEvents } from "@/lib/runtime/timeline/persist";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

import type { RunEvent } from "@/lib/events/types";

function serializeRun(
  r: {
    id: string;
    userId?: string;
    input: string;
    surface?: string;
    executionMode?: string;
    agentId?: string;
    backend?: string;
    missionId?: string;
    status: string;
    createdAt: number;
    completedAt?: number;
    assets: Array<{ id: string; name: string; type: string }>;
  },
  events: RunEvent[],
) {
  return {
    id: r.id,
    userId: r.userId,
    input: r.input,
    surface: r.surface,
    executionMode: r.executionMode,
    agentId: r.agentId,
    backend: r.backend,
    missionId: r.missionId,
    status: r.status,
    createdAt: r.createdAt,
    completedAt: r.completedAt,
    assets: r.assets,
    events,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "GET /api/v2/runs/[id]" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;

  try {
    // In-memory run has live events — best for active/recent runs
    const memRun = getRunById(id);
    if (memRun && memRun.events.length > 0) {
      // Verify ownership
      if (memRun.userId && memRun.userId !== scope.userId) {
        console.warn(`[v2/runs/${id}] Access denied — user mismatch (mem)`);
        return NextResponse.json({ error: "run_not_found" }, { status: 404 });
      }

      return NextResponse.json({
        run: serializeRun(memRun, memRun.events),
        timeline: normalizeRunEventsToTimeline({
          runId: id,
          events: memRun.events,
        }),
        timelineSource: "memory" as const,
      });
    }

    // Fall back to persisted run + persisted timeline events
    const persisted = memRun ? null : await getPersistedRun(id);
    const run = memRun ?? persisted;
    if (!run) {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    // Verify ownership for persisted runs
    if (run.userId && run.userId !== scope.userId) {
      console.warn(`[v2/runs/${id}] Access denied — user mismatch (db)`);
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    const persistedEvents = await getPersistedRunEvents({ runId: id });
    const timeline = persistedEvents.length > 0
      ? normalizeRunEventsToTimeline({
          runId: id,
          events: persistedEvents.map((e) => e.payload),
        })
      : [];

    const events = persistedEvents.map((e) => e.payload as RunEvent);

    return NextResponse.json({
      run: serializeRun(run, events),
      timeline,
      timelineSource: persistedEvents.length > 0 ? "persistent" : "empty",
    });
  } catch (e) {
    console.error(`GET /api/v2/runs/${id}: uncaught`, e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
