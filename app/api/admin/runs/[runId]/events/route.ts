/**
 * GET /api/admin/runs/[runId]/events — persisted timeline events for replay.
 *
 * Reads the `run_logs` table via getPersistedRunEvents and returns them
 * ordered by timestamp. Powers the canvas replay scrubber.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isError } from "../../../_helpers";
import { getPersistedRunEvents } from "@/lib/engine/runtime/timeline/persist";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const guard = await requireAdmin("GET /api/admin/runs/[runId]/events", { resource: "runs", action: "read" });
  if (isError(guard)) return guard;

  const { runId } = await params;
  if (!runId) {
    return NextResponse.json({ error: "runId required" }, { status: 400 });
  }

  try {
    const events = await getPersistedRunEvents({ runId });
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[Admin API] GET /runs/[runId]/events error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
