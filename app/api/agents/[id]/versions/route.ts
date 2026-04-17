import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
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
      .from("agent_versions")
      .select("id, version, system_prompt, config_snapshot, model_profile_id, created_at")
      .eq("agent_id", id)
      .order("version", { ascending: false })
      .limit(50);

    if (error) return dbErr(`GET /api/agents/${id}/versions`, error);
    return ok({ versions: data ?? [] });
  } catch (e) {
    console.error(`GET /api/agents/${id}/versions: uncaught`, e);
    return err("internal_error", 500);
  }
}
