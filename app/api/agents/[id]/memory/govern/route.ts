import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { enforceMemoryPolicy } from "@/lib/engine/runtime";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();

    const { data: agent, error: agentErr } = await sb
      .from("agents")
      .select("memory_policy_id")
      .eq("id", id)
      .single();

    if (agentErr || !agent) return err("agent_not_found", 404);

    const result = await enforceMemoryPolicy(sb, id, agent.memory_policy_id);
    return ok({ ...result, agent_id: id });
  } catch (e) {
    console.error(`POST /api/agents/${id}/memory/govern: uncaught`, e);
    return err("internal_error", 500);
  }
}
