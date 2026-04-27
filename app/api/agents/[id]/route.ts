import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import { updateAgentSchema, ok, err, parseBody, dbErr } from "@/lib/domain";
import type { Database, Json } from "@/lib/database.types";

type AgentUpdate = Database["public"]["Tables"]["agents"]["Update"];

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb.from("agents").select("*").eq("id", id).single();
    if (error) return dbErr(`GET /api/agents/${id}`, error);
    return ok({ agent: data });
  } catch (e) {
    console.error(`GET /api/agents/${id}: uncaught`, e);
    return err("internal_error", 500);
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = await req.json();
    const parsed = parseBody(updateAgentSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();

    // Load current state before update for snapshotting
    const { data: current } = await sb.from("agents").select("*").eq("id", id).single();
    if (!current) return err("agent_not_found", 404);

    // Auto-snapshot: create version from current state
    const configSnapshot = {
      model_provider: current.model_provider,
      model_name: current.model_name,
      temperature: current.temperature,
      max_tokens: current.max_tokens,
      top_p: current.top_p,
    } as Record<string, Json>;

    const { data: versionData } = await sb
      .from("agent_versions")
      .insert({
        agent_id: id,
        version: current.version,
        system_prompt: current.system_prompt,
        config_snapshot: configSnapshot,
        model_profile_id: current.model_profile_id ?? null,
      })
      .select("id")
      .single();

    // Increment version + apply update
    const updateData = {
      ...(parsed.data as AgentUpdate),
      version: current.version + 1,
      active_version_id: versionData?.id ?? current.active_version_id,
    };

    const { data, error } = await sb
      .from("agents")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) return dbErr(`PUT /api/agents/${id}`, error);
    return ok({ agent: data, version_snapshot_id: versionData?.id });
  } catch (e) {
    console.error(`PUT /api/agents/${id}: uncaught`, e);
    return err("internal_error", 500);
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const sb = requireServerSupabase();
    const { error } = await sb.from("agents").delete().eq("id", id);
    if (error) return dbErr(`DELETE /api/agents/${id}`, error);
    return ok({ deleted: true });
  } catch (e) {
    console.error(`DELETE /api/agents/${id}: uncaught`, e);
    return err("internal_error", 500);
  }
}
