/**
 * Missions API — Create and list scheduled missions.
 * Uses the canonical v2 mission layer (lib/runtime/missions + state/adapter).
 */

import { NextRequest, NextResponse } from "next/server";
import { getUserId } from "@/lib/get-user-id";
import { createScheduledMission } from "@/lib/runtime/missions/create-mission";
import { addMission, disableMission, getMission } from "@/lib/runtime/missions/store";
import {
  saveScheduledMission,
  getScheduledMissions,
  updateScheduledMission,
} from "@/lib/runtime/state/adapter";

export const dynamic = "force-dynamic";

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

export async function GET() {
  try {
    const missions = await getScheduledMissions();
    return NextResponse.json({ missions });
  } catch (e) {
    console.error("GET /api/v2/missions: uncaught", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: {
    name?: string;
    input?: string;
    schedule?: string;
    enabled?: boolean;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.input || !body.schedule) {
    return NextResponse.json(
      { error: "input_and_schedule_required" },
      { status: 400 },
    );
  }

  const name = body.name || body.input.slice(0, 80);

  const mission = createScheduledMission({
    name,
    input: body.input,
    schedule: body.schedule,
    tenantId: DEV_TENANT_ID,
    workspaceId: DEV_WORKSPACE_ID,
    userId,
  });

  if (body.enabled === false) {
    (mission as { enabled: boolean }).enabled = false;
  }

  addMission(mission);

  const persisted = await saveScheduledMission({
    id: mission.id,
    tenantId: mission.tenantId,
    workspaceId: mission.workspaceId,
    userId: mission.userId,
    name: mission.name,
    input: mission.input,
    schedule: mission.schedule,
    enabled: mission.enabled,
    createdAt: mission.createdAt,
  });

  if (!persisted) {
    console.warn("[MissionsAPI] Mission saved in-memory only — Supabase unavailable");
  }

  console.log(`[MissionsAPI] Mission created: ${mission.id} — ${mission.schedule}`);

  return NextResponse.json({ mission }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: { id?: string; enabled?: boolean };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.id || body.enabled === undefined) {
    return NextResponse.json({ error: "id_and_enabled_required" }, { status: 400 });
  }

  // Update in-memory
  const mem = getMission(body.id);
  if (mem) {
    if (!body.enabled) {
      disableMission(body.id);
    } else {
      mem.enabled = true;
    }
  }

  // Update in Supabase
  await updateScheduledMission(body.id, { enabled: body.enabled });

  console.log(`[MissionsAPI] Mission ${body.id} ${body.enabled ? "enabled" : "disabled"}`);

  return NextResponse.json({ ok: true, id: body.id, enabled: body.enabled });
}
