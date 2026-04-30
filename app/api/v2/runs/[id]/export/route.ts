/**
 * GET /api/v2/runs/[id]/export — Stub : retourne le run + timeline en JSON
 * avec un Content-Disposition `attachment` pour déclencher un téléchargement
 * côté navigateur. Phase A : pas de format trace formel (otel/json-line) —
 * on sérialise simplement la même payload que GET /api/v2/runs/[id].
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getRunById as getPersistedRun } from "@/lib/engine/runtime/state/adapter";
import { getRunById } from "@/lib/engine/runtime/runs/store";
import { normalizeRunEventsToTimeline } from "@/lib/engine/runtime/timeline/normalize";
import { getPersistedRunEvents } from "@/lib/engine/runtime/timeline/persist";
import { requireScope } from "@/lib/platform/auth/scope";
import type { RunEvent } from "@/lib/events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ParamsSchema = z.object({ id: z.string().min(1, "id_required") });

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({ context: "GET /api/v2/runs/[id]/export" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const raw = await params;
  const parsed = ParamsSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_params", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const id = parsed.data.id;

  try {
    const memRun = getRunById(id);
    if (memRun && memRun.userId && memRun.userId !== scope.userId) {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    const persisted = memRun ? null : await getPersistedRun(id);
    const run = memRun ?? persisted;
    if (!run) {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    if (run.userId && run.userId !== scope.userId) {
      return NextResponse.json({ error: "run_not_found" }, { status: 404 });
    }

    let events: RunEvent[] = [];
    if (memRun && memRun.events.length > 0) {
      events = memRun.events;
    } else {
      const persistedEvents = await getPersistedRunEvents({ runId: id });
      events = persistedEvents.map((e) => e.payload as RunEvent);
    }

    const timeline = events.length > 0
      ? normalizeRunEventsToTimeline({ runId: id, events })
      : [];

    const payload = {
      run: {
        id: run.id,
        userId: run.userId,
        input: run.input,
        surface: run.surface,
        executionMode: run.executionMode,
        agentId: run.agentId,
        backend: run.backend,
        missionId: run.missionId,
        status: run.status,
        createdAt: run.createdAt,
        completedAt: run.completedAt,
        assets: run.assets,
      },
      timeline,
      events,
      exportedAt: Date.now(),
    };

    const body = JSON.stringify(payload, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="run-${id}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error(`GET /api/v2/runs/${id}/export: uncaught`, e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
