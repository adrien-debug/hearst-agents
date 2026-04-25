import { NextResponse } from "next/server";
import { getScheduledMissions } from "@/lib/engine/runtime/state/adapter";
import { getAllMissions as getMemoryMissions } from "@/lib/engine/runtime/missions/store";
import { getAllMissionOps } from "@/lib/engine/runtime/missions/ops-store";
import { requireScope } from "@/lib/scope";
import type { MissionOpsRecord } from "@/lib/engine/runtime/missions/ops-types";

export const dynamic = "force-dynamic";

export async function GET() {
  const { error: authError } = await requireScope({ context: "GET /api/v2/missions/ops" });
  if (authError) return NextResponse.json({ error: authError.message }, { status: authError.status });

  try {
    let missionList = await getScheduledMissions();

    if (missionList.length === 0) {
      missionList = getMemoryMissions().map((m) => ({
        id: m.id,
        tenantId: m.tenantId,
        workspaceId: m.workspaceId,
        userId: m.userId,
        name: m.name,
        input: m.input,
        schedule: m.schedule,
        enabled: m.enabled,
        createdAt: m.createdAt,
        lastRunAt: m.lastRunAt,
        lastRunId: m.lastRunId,
      }));
    }

    const opsMap = getAllMissionOps();

    const missions: MissionOpsRecord[] = missionList.map((m) => {
      const live = opsMap.get(m.id);

      // In-memory live status takes priority for "running" detection;
      // persisted fields are the durable source of truth for everything else.
      const isLiveRunning = live?.status === "running";

      return {
        missionId: m.id,
        name: m.name,
        tenantId: m.tenantId,
        workspaceId: m.workspaceId,
        enabled: m.enabled,
        status: isLiveRunning ? "running" : (m.lastRunStatus ?? live?.lastRunStatus ?? "idle"),
        lastRunAt: live?.lastRunAt ?? m.lastRunAt,
        lastRunId: live?.lastRunId ?? m.lastRunId,
        lastRunStatus: live?.lastRunStatus ?? m.lastRunStatus,
        lastError: live?.lastError ?? m.lastError,
        runningSince: isLiveRunning ? live?.runningSince : undefined,
      };
    });

    return NextResponse.json({ missions });
  } catch (e) {
    console.error("GET /api/v2/missions/ops:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
