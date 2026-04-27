import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { ok, err, dbErr } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) return dbErr(`GET /api/conversations/${id}/messages`, error);
    return ok({ messages: data ?? [] });
  } catch (e) {
    console.error(`GET /api/conversations/${id}/messages: uncaught`, e);
    return err("internal_error", 500);
  }
}
