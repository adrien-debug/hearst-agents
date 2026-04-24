/**
 * POST /api/v2/missions/[id]/pause
 *
 * Pause an active mission or watcher.
 * Canonical: uses runtime missions store with scope/auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/scope";
import { getMission as getRuntimeMission, disableMission } from "@/lib/runtime/missions/store";
import { getScheduledMissions, updateScheduledMission } from "@/lib/runtime/state/adapter";
import { pauseMission as pausePlannerMission } from "@/lib/planner/mission-engine";
import { getMission as getPlannerMission } from "@/lib/planner/store";
import { manifestMission } from "@/lib/right-panel/manifestation";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "POST /api/v2/missions/[id]/pause" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const missionId = (await params).id;

  try {
    // ── 1. Try runtime missions (canonical) ───────────────────
    const runtimeMission = getRuntimeMission(missionId);
    if (runtimeMission) {
      // Verify ownership
      if (runtimeMission.userId && runtimeMission.userId !== scope.userId) {
        console.warn(`[MissionsAPI] Access denied — user mismatch for mission ${missionId}`);
        return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
      }

      // Already disabled (paused)
      if (!runtimeMission.enabled) {
        return NextResponse.json({
          success: true,
          message: "Mission already paused",
          missionId: runtimeMission.id,
          status: "paused",
        });
      }

      // Pause by disabling
      disableMission(missionId);
      await updateScheduledMission(missionId, { enabled: false });

      console.log(`[MissionsAPI] Runtime mission paused: ${missionId} (user: ${scope.userId.slice(0, 8)})`);

      return NextResponse.json({
        success: true,
        missionId: runtimeMission.id,
        status: "paused",
      });
    }

    // ── 2. Fallback: try persisted runtime missions ───────────
    const persisted = await getScheduledMissions({
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
    });
    const persistedMission = persisted.find((m) => m.id === missionId);

    if (persistedMission) {
      if (!persistedMission.enabled) {
        return NextResponse.json({
          success: true,
          message: "Mission already paused",
          missionId: persistedMission.id,
          status: "paused",
        });
      }

      await updateScheduledMission(missionId, { enabled: false });
      console.log(`[MissionsAPI] Persisted mission paused: ${missionId} (user: ${scope.userId.slice(0, 8)})`);

      return NextResponse.json({
        success: true,
        missionId: persistedMission.id,
        status: "paused",
      });
    }

    // ── 3. Fallback: planner missions (legacy) ─────────────────
    const plannerMission = getPlannerMission(missionId);
    if (plannerMission) {
      if (plannerMission.status === "paused") {
        return NextResponse.json({
          success: true,
          message: "Mission already paused",
          mission: manifestMission(plannerMission),
        });
      }

      if (plannerMission.status !== "active") {
        return NextResponse.json(
          { error: `Cannot pause mission with status: ${plannerMission.status}` },
          { status: 400 },
        );
      }

      const pausedMission = pausePlannerMission(missionId);
      if (!pausedMission) {
        console.error(`[MissionsAPI] Failed to pause planner mission: ${missionId}`);
        return NextResponse.json({ error: "Failed to pause mission" }, { status: 500 });
      }

      console.log(`[MissionsAPI] Planner mission paused: ${missionId}`);

      return NextResponse.json({
        success: true,
        missionId: pausedMission.id,
        status: pausedMission.status,
        focalObject: manifestMission(pausedMission),
      });
    }

    // ── 4. Not found ───────────────────────────────────────────
    console.warn(`[MissionsAPI] Mission not found: ${missionId}`);
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });

  } catch (err) {
    console.error(`[MissionsAPI] Error pausing mission ${missionId}:`, err);
    return NextResponse.json(
      { error: "Failed to pause mission", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
