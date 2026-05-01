/**
 * Mission Memory — context snapshot (vague 9).
 *
 * GET /api/v2/missions/[id]/context
 *     → assemble summary + 10 derniers messages + retrieval pgvector + KG
 *       global, sans déclencher de run. Sert à rafraîchir la section
 *       "Conversation" du MissionStage et le résumé compact du
 *       ContextRailForMission.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getMission } from "@/lib/engine/runtime/missions/store";
import { getScheduledMissions } from "@/lib/engine/runtime/state/adapter";
import { getMissionContext } from "@/lib/memory/mission-context";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/missions/[id]/context",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;

  // Résolution mission (memory first, puis Supabase) pour récupérer
  // missionInput + summary preload.
  let missionInput: string | null = null;
  let preloadedSummary: string | null = null;
  let preloadedSummaryUpdatedAt: number | null = null;

  const mem = getMission(id);
  if (mem) {
    if (mem.userId && mem.userId !== scope.userId) {
      return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
    }
    missionInput = mem.input;
  } else {
    const persisted = await getScheduledMissions({ userId: scope.userId });
    const found = persisted.find((m) => m.id === id);
    if (!found) {
      return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
    }
    missionInput = found.input;
    preloadedSummary = found.contextSummary ?? null;
    preloadedSummaryUpdatedAt = found.contextSummaryUpdatedAt ?? null;
  }

  if (!missionInput) {
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
  }

  const context = await getMissionContext({
    missionId: id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    missionInput,
    preloadedSummary,
    preloadedSummaryUpdatedAt,
  });

  return NextResponse.json({ context });
}
