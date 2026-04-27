/**
 * POST /api/v2/missions/[id]/resume
 *
 * Resume a paused mission or watcher.
 * Canonical: uses runtime missions store with scope/auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getMission as getRuntimeMission } from "@/lib/engine/runtime/missions/store";
import { getScheduledMissions, updateScheduledMission } from "@/lib/engine/runtime/state/adapter";
import { resumeMission as resumePlannerMission } from "@/lib/engine/planner/mission-engine";
import { getMission as getPlannerMission } from "@/lib/engine/planner/store";
import { manifestMission } from "@/lib/ui/right-panel/manifestation";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "POST /api/v2/missions/[id]/resume" });
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

      // Already enabled (active)
      if (runtimeMission.enabled) {
        return NextResponse.json({
          success: true,
          message: "Mission already active",
          missionId: runtimeMission.id,
          status: "active",
        });
      }

      // Resume by enabling
      runtimeMission.enabled = true;
      await updateScheduledMission(missionId, { enabled: true });

      console.log(`[MissionsAPI] Runtime mission resumed: ${missionId} (user: ${scope.userId.slice(0, 8)})`);

      return NextResponse.json({
        success: true,
        missionId: runtimeMission.id,
        status: "active",
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
      if (persistedMission.enabled) {
        return NextResponse.json({
          success: true,
          message: "Mission already active",
          missionId: persistedMission.id,
          status: "active",
        });
      }

      await updateScheduledMission(missionId, { enabled: true });
      console.log(`[MissionsAPI] Persisted mission resumed: ${missionId} (user: ${scope.userId.slice(0, 8)})`);

      return NextResponse.json({
        success: true,
        missionId: persistedMission.id,
        status: "active",
      });
    }

    // ── 3. Fallback: planner missions (legacy) ─────────────────
    const plannerMission = getPlannerMission(missionId);
    if (plannerMission) {
      if (plannerMission.status === "active") {
        return NextResponse.json({
          success: true,
          message: "Mission already active",
          mission: manifestMission(plannerMission),
        });
      }

      if (plannerMission.status !== "paused") {
        return NextResponse.json(
          { error: `Cannot resume mission with status: ${plannerMission.status}` },
          { status: 400 },
        );
      }

      const resumedMission = resumePlannerMission(missionId);
      if (!resumedMission) {
        console.error(`[MissionsAPI] Failed to resume planner mission: ${missionId}`);
        return NextResponse.json({ error: "Failed to resume mission" }, { status: 500 });
      }

      console.log(`[MissionsAPI] Planner mission resumed: ${missionId}`);

      return NextResponse.json({
        success: true,
        missionId: resumedMission.id,
        status: resumedMission.status,
        nextRunAt: resumedMission.nextRunAt,
        focalObject: manifestMission(resumedMission),
      });
    }

    // ── 4. Not found ───────────────────────────────────────────
    console.warn(`[MissionsAPI] Mission not found: ${missionId}`);
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });

  } catch (err) {
    console.error(`[MissionsAPI] Error resuming mission ${missionId}:`, err);
    return NextResponse.json(
      { error: "Failed to resume mission", message: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
