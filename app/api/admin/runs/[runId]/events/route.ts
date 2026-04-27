import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getPersistedRunEvents } from "@/lib/engine/runtime/timeline/persist";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const { error } = await requireScope({ context: "GET /api/admin/runs/[runId]/events" });
  if (error) return NextResponse.json({ error: error.message }, { status: error.status });

  const { runId } = await params;
  if (!runId) return NextResponse.json({ error: "runId required" }, { status: 400 });

  try {
    const events = await getPersistedRunEvents({ runId });
    return NextResponse.json({ events });
  } catch (e) {
    console.error("[Admin API] GET /runs/[runId]/events error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
