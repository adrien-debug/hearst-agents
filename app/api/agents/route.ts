import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { createAgentSchema, ok, err, parseBody, dbErr, slugify } from "@/lib/domain";
import type { Database } from "@/lib/database.types";

type AgentInsert = Database["public"]["Tables"]["agents"]["Insert"];

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("agents")
      .select("id, name, slug, description, model_provider, model_name, status, version, created_at, updated_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return dbErr("GET /api/agents", error);
    return ok({ agents: data ?? [] });
  } catch (e) {
    console.error("GET /api/agents: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(createAgentSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const input = parsed.data;
    const slug = input.slug ?? slugify(input.name);

    const row: AgentInsert = {
      name: input.name,
      slug,
      description: input.description ?? null,
      model_provider: input.model_provider,
      model_name: input.model_name,
      system_prompt: input.system_prompt,
      temperature: input.temperature,
      max_tokens: input.max_tokens,
      top_p: input.top_p,
      status: input.status,
      metadata: input.metadata as AgentInsert["metadata"],
      model_profile_id: input.model_profile_id ?? null,
      memory_policy_id: input.memory_policy_id ?? null,
    };

    const { data, error } = await sb
      .from("agents")
      .insert(row)
      .select()
      .single();

    if (error) return dbErr("POST /api/agents", error);
    return ok({ agent: data }, 201);
  } catch (e) {
    console.error("POST /api/agents: uncaught", e);
    return err("internal_error", 500);
  }
}
