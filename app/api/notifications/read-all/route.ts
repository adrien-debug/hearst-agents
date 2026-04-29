/**
 * POST /api/notifications/read-all — Marque toutes les notifications non-lues
 * du tenant courant (ciblées au user ou broadcast) comme lues.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { markAllRead } from "@/lib/notifications/in-app";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: NextRequest) {
  const { scope, error } = await requireScope({ context: "notifications/read-all POST" });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const db = getServerSupabase();
  if (!db) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  await markAllRead(db, { tenantId: scope.tenantId, userId: scope.userId });
  return NextResponse.json({ ok: true });
}
