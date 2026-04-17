import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { createMemorySchema, ok, err, parseBody, dbErr } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("agent_memory")
      .select("*")
      .eq("agent_id", id)
      .order("importance", { ascending: false })
      .limit(50);

    if (error) return dbErr(`GET /api/agents/${id}/memory`, error);
    return ok({ memories: data ?? [] });
  } catch (e) {
    console.error(`GET /api/agents/${id}/memory: uncaught`, e);
    return err("internal_error", 500);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = parseBody(createMemorySchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const input = parsed.data;

    const { data, error } = await sb
      .from("agent_memory")
      .insert({
        agent_id: id,
        memory_type: input.memory_type,
        key: input.key,
        value: input.value,
        importance: input.importance,
        expires_at: input.expires_at ?? null,
      })
      .select()
      .single();

    if (error) return dbErr(`POST /api/agents/${id}/memory`, error);
    return ok({ memory: data }, 201);
  } catch (e) {
    console.error(`POST /api/agents/${id}/memory: uncaught`, e);
    return err("internal_error", 500);
  }
}
