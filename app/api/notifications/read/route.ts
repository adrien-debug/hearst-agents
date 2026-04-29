/**
 * POST /api/notifications/read — Marque une notification comme lue.
 *
 * Body : { id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { markRead } from "@/lib/notifications/in-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { scope, error } = await requireScope({ context: "notifications/read POST" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const db = getServerSupabase();
  if (!db) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  let body: { id?: string };
  try {
    body = (await req.json()) as { id?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  if (!body.id || typeof body.id !== "string") {
    return NextResponse.json({ error: "id_required" }, { status: 400 });
  }

  await markRead(db, { notificationId: body.id, tenantId: scope.tenantId });
  return NextResponse.json({ ok: true });
}
