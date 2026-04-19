import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { createConversationSchema, ok, err, parseBody, dbErr } from "@/lib/domain";
import { getUserId } from "@/lib/get-user-id";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) return err("not_authenticated", 401);

    const sb = requireServerSupabase();
    const agentId = req.nextUrl.searchParams.get("agent_id");

    let query = sb
      .from("conversations")
      .select("id, agent_id, title, status, created_at")
      .eq("user_identifier", userId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (agentId) query = query.eq("agent_id", agentId);

    const { data, error } = await query;
    if (error) return dbErr("GET /api/conversations", error);
    return ok({ conversations: data ?? [] });
  } catch (e) {
    console.error("GET /api/conversations: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getUserId();
    if (!userId) return err("not_authenticated", 401);

    const body = await req.json();
    const parsed = parseBody(createConversationSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const input = parsed.data;

    const { data, error } = await sb
      .from("conversations")
      .insert({
        agent_id: input.agent_id,
        title: input.title,
        user_identifier: userId,
      })
      .select()
      .single();

    if (error) return dbErr("POST /api/conversations", error);
    return ok({ conversation: data }, 201);
  } catch (e) {
    console.error("POST /api/conversations: uncaught", e);
    return err("internal_error", 500);
  }
}
