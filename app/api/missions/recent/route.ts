import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

function getRawSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export async function GET() {
  const userId = await getUserId();
  if (!userId) {
    return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
  }

  try {
    const sb = getRawSupabase();

    const { data, error } = await sb
      .from("missions")
      .select("id, title, surface, status, result, error, services, created_at, updated_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) {
      console.error("[Missions] DB error:", error.message);
      return NextResponse.json({ missions: [] });
    }

    return NextResponse.json({ missions: data ?? [] });
  } catch (err) {
    console.error("[Missions] Error:", err instanceof Error ? err.message : err);
    return NextResponse.json({ missions: [] });
  }
}
