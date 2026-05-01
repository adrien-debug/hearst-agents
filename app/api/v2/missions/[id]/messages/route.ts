/**
 * Mission Memory — messages API (vague 9).
 *
 * GET  /api/v2/missions/[id]/messages?limit=50&before=<iso>
 *      → liste les messages mission (chronologique ASC).
 *
 * POST /api/v2/missions/[id]/messages
 *      body: { content: string, role?: "user" | "system" }
 *      → append un message à la mission. Rôle par défaut "user".
 *
 * Ownership : on vérifie que la mission appartient à l'utilisateur via le
 * memory store ou Supabase. 404 si la mission n'existe pas / n'appartient pas
 * au caller, 403 explicite si on a une trace de mismatch user.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getMission } from "@/lib/engine/runtime/missions/store";
import { getScheduledMissions } from "@/lib/engine/runtime/state/adapter";
import {
  appendMissionMessage,
  listMissionMessages,
} from "@/lib/memory/mission-context";

export const dynamic = "force-dynamic";

async function ensureOwnership(
  missionId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; status: number }> {
  const mem = getMission(missionId);
  if (mem) {
    if (mem.userId && mem.userId !== userId) return { ok: false, status: 404 };
    return { ok: true };
  }
  const persisted = await getScheduledMissions({ userId });
  const found = persisted.find((m) => m.id === missionId);
  if (!found) return { ok: false, status: 404 };
  return { ok: true };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/missions/[id]/messages",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;
  const ownership = await ensureOwnership(id, scope.userId);
  if (!ownership.ok) {
    return NextResponse.json({ error: "mission_not_found" }, { status: ownership.status });
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const limit = limitRaw ? Math.max(1, Math.min(parseInt(limitRaw, 10) || 20, 200)) : 20;
  const before = url.searchParams.get("before") ?? undefined;

  const messages = await listMissionMessages({
    missionId: id,
    userId: scope.userId,
    limit,
    before,
  });

  return NextResponse.json({ messages });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { scope, error } = await requireScope({
    context: "POST /api/v2/missions/[id]/messages",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const { id } = await params;
  const ownership = await ensureOwnership(id, scope.userId);
  if (!ownership.ok) {
    return NextResponse.json({ error: "mission_not_found" }, { status: ownership.status });
  }

  let body: { content?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const content =
    typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content_required" }, { status: 400 });
  }

  // Le caller ne peut poser que des messages "user" ou "system" — les
  // assistant sont posés exclusivement par le runtime (post-run).
  const role: "user" | "system" =
    body.role === "system" ? "system" : "user";

  const message = await appendMissionMessage({
    missionId: id,
    userId: scope.userId,
    tenantId: scope.tenantId,
    role,
    content,
  });

  if (!message) {
    return NextResponse.json({ error: "persist_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message });
}
