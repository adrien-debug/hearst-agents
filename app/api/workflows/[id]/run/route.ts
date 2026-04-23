import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { executeWorkflow } from "@/lib/runtime/workflow-engine";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: { input?: Record<string, unknown>; cost_budget_usd?: number } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is ok
  }

  try {
    const sb = requireServerSupabase();

    const { data: workflow, error: wfErr } = await sb
      .from("workflows")
      .select("id, status")
      .eq("id", id)
      .single();

    if (wfErr || !workflow) return err("workflow_not_found", 404);
    if (workflow.status === "archived") return err("workflow_archived", 400);

    const result = await executeWorkflow(sb, id, body.input ?? {}, {
      cost_budget_usd: body.cost_budget_usd,
    });

    if (result.status === "failed") {
      return err(result.error ?? "workflow_failed", 500);
    }

    return ok({
      run_id: result.run_id,
      workflow_version_id: result.workflow_version_id,
      output: result.output,
    });
  } catch (e) {
    console.error(`POST /api/workflows/${id}/run: uncaught`, e);
    return err("internal_error", 500);
  }
}
