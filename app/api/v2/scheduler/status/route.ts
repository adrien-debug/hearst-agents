import { NextResponse } from "next/server";
import { INSTANCE_ID } from "@/lib/runtime/instance-id";
import { getSchedulerLeader } from "@/lib/runtime/missions/leader-lease";
import { getSchedulerMode } from "@/lib/runtime/missions/scheduler-init";
import type { SchedulerStatus } from "@/lib/runtime/missions/ops-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const leader = await getSchedulerLeader();
    const mode = getSchedulerMode();

    const status: SchedulerStatus = {
      instanceId: INSTANCE_ID,
      isLeader: mode === "leader" || mode === "local_fallback",
      leaderInstanceId: leader?.instanceId ?? null,
      leadershipExpiresAt: leader?.expiresAt ?? null,
      mode,
    };

    return NextResponse.json({ scheduler: status });
  } catch (e) {
    console.error("GET /api/v2/scheduler/status:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
