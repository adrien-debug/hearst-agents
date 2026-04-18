import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserId } from "@/lib/get-user-id";
import { z } from "zod";

export const dynamic = "force-dynamic";

function getRawSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

const schema = z.object({
  mission_id: z.string(),
});

export async function POST(req: NextRequest) {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { mission_id } = parsed.data;
  const sb = getRawSupabase();

  const { data: mission, error: fetchErr } = await sb
    .from("missions")
    .select("id, status, user_id")
    .eq("id", mission_id)
    .single();

  if (fetchErr || !mission) {
    return NextResponse.json({ error: "mission_not_found" }, { status: 404 });
  }

  if (mission.user_id !== userId) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  if (mission.status !== "awaiting_approval") {
    return NextResponse.json({ error: "mission_not_awaiting_approval" }, { status: 409 });
  }

  const { error: updateErr } = await sb
    .from("missions")
    .update({
      status: "completed",
      updated_at: new Date().toISOString(),
    })
    .eq("id", mission_id);

  if (updateErr) {
    console.error("[Mission/Approve] Update failed:", updateErr.message);
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
