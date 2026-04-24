/**
 * Mission Detail API — Update and delete specific missions.
 */

import { NextRequest, NextResponse } from "next/server";
import { getMission, disableMission } from "@/lib/runtime/missions/store";
import { updateScheduledMission } from "@/lib/runtime/state/adapter";
import { requireScope } from "@/lib/scope";

export const dynamic = "force-dynamic";

async function verifyMissionOwnership(id: string, userId: string): Promise<boolean> {
  const memMission = getMission(id);
  if (memMission && memMission.userId && memMission.userId !== userId) {
    return false;
  }
  return true;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "PATCH /api/v2/missions/[id]" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;

  // Verify ownership
  if (!await verifyMissionOwnership(id, scope.userId)) {
    console.warn(`[MissionsAPI] Access denied — user mismatch for mission ${id}`);
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
  }

  let body: {
    name?: string;
    description?: string;
    prompt?: string;
    frequency?: "daily" | "weekly" | "monthly" | "custom";
    customCron?: string;
    enabled?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Update in-memory
  const memMission = getMission(id);
  if (memMission) {
    if (body.name !== undefined) memMission.name = body.name;
    if (body.prompt !== undefined) memMission.input = body.prompt;
    if (body.enabled !== undefined) {
      if (body.enabled) {
        memMission.enabled = true;
      } else {
        disableMission(id);
      }
    }
  }

  // Map frequency to schedule
  let schedule: string | undefined;
  if (body.frequency) {
    const schedules: Record<string, string> = {
      daily: "0 9 * * *",
      weekly: "0 9 * * 1",
      monthly: "0 9 1 * *",
    };
    schedule = body.frequency === "custom" ? body.customCron : schedules[body.frequency];
  }

  // Update in Supabase
  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.prompt !== undefined) updates.input = body.prompt;
  if (schedule !== undefined) updates.schedule = schedule;
  if (body.enabled !== undefined) updates.enabled = body.enabled;

  if (Object.keys(updates).length > 0) {
    await updateScheduledMission(id, updates);
  }

  console.log(`[MissionsAPI] Mission ${id} updated (user: ${scope.userId.slice(0, 8)})`);

  return NextResponse.json({
    ok: true,
    id,
    updates: Object.keys(updates),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Resolve scope with dev fallback allowed
  const { scope, error } = await requireScope({ context: "DELETE /api/v2/missions/[id]" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;

  // Verify ownership
  if (!await verifyMissionOwnership(id, scope.userId)) {
    console.warn(`[MissionsAPI] Access denied — user mismatch for mission ${id}`);
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
  }

  // Note: Deletion requires a delete method in the adapter
  // For now, we disable the mission as soft-delete
  const memMission = getMission(id);
  if (memMission) {
    disableMission(id);
  }

  await updateScheduledMission(id, { enabled: false });

  console.log(`[MissionsAPI] Mission ${id} deleted (soft) (user: ${scope.userId.slice(0, 8)})`);

  return NextResponse.json({ ok: true, id, deleted: true });
}
