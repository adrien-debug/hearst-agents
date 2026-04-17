import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { createWorkflowSchema, ok, err, parseBody, dbErr } from "@/lib/domain";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const sb = requireServerSupabase();
    const { data, error } = await sb
      .from("workflows")
      .select("*, workflow_steps(id, step_order, action_type)")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return dbErr("GET /api/workflows", error);
    return ok({ workflows: data ?? [] });
  } catch (e) {
    console.error("GET /api/workflows: uncaught", e);
    return err("internal_error", 500);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = parseBody(createWorkflowSchema, body);
    if (!parsed.success) return parsed.response;

    const sb = requireServerSupabase();
    const input = parsed.data;

    const { data, error } = await sb
      .from("workflows")
      .insert({
        name: input.name,
        description: input.description ?? null,
        trigger_type: input.trigger_type,
        status: input.status,
      })
      .select()
      .single();

    if (error) return dbErr("POST /api/workflows", error);
    return ok({ workflow: data }, 201);
  } catch (e) {
    console.error("POST /api/workflows: uncaught", e);
    return err("internal_error", 500);
  }
}
