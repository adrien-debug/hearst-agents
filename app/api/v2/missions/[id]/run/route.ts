/**
 * Mission Run Now — Manually trigger a scheduled mission.
 * Creates a real v2 run through the orchestrator with missionId linkage.
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { requireServerSupabase } from "@/lib/supabase-server";
import { orchestrateV2 } from "@/lib/orchestrator/entry";
import { getScheduledMissions, updateScheduledMission } from "@/lib/runtime/state/adapter";
import { updateMissionLastRun, getMission } from "@/lib/runtime/missions/store";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  const { id } = await params;

  // Find mission — memory first, then persisted
  let missionInput: string | null = null;
  let missionName: string | null = null;

  const memMission = getMission(id);
  if (memMission) {
    missionInput = memMission.input;
    missionName = memMission.name;
  } else {
    const persisted = await getScheduledMissions();
    const found = persisted.find((m) => m.id === id);
    if (found) {
      missionInput = found.input;
      missionName = found.name;
    }
  }

  if (!missionInput) {
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
  }

  console.log(`[MissionRunNow] Triggering "${missionName}" (${id})`);

  const db = requireServerSupabase();

  const stream = orchestrateV2(db, {
    userId,
    message: missionInput,
    missionId: id,
  });

  // Consume the stream to completion, extract the run_id
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let runId: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = decoder.decode(value, { stream: true });
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const event = JSON.parse(line.slice(6));
          if (event.type === "run_started" && event.run_id) {
            runId = event.run_id;
          }
        } catch { /* skip */ }
      }
    }
  } catch (err) {
    console.error(`[MissionRunNow] Stream error for mission ${id}:`, err);
  }

  if (runId) {
    updateMissionLastRun(id, runId);
    void updateScheduledMission(id, {
      lastRunAt: Date.now(),
      lastRunId: runId,
    });
  }

  return NextResponse.json({
    ok: true,
    missionId: id,
    runId,
  });
}
