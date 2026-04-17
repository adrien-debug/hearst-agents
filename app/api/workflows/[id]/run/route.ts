import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err } from "@/lib/domain";
import { executeWorkflow } from "@/lib/runtime/workflow-engine";
import type { Json } from "@/lib/database.types";

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

    // Create legacy workflow_run record for backwards compatibility
    const { data: wfRun } = await sb
      .from("workflow_runs")
      .insert({
        workflow_id: id,
        status: "running",
        input: (body.input ?? {}) as Record<string, Json>,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    const result = await executeWorkflow(sb, id, body.input ?? {}, {
      cost_budget_usd: body.cost_budget_usd,
    });

    // Update legacy workflow_run
    if (wfRun) {
      await sb
        .from("workflow_runs")
        .update({
          status: result.status,
          output: (result.output ?? {}) as Record<string, Json>,
          error: result.error ?? null,
          finished_at: new Date().toISOString(),
        })
        .eq("id", wfRun.id);
    }

    if (result.status === "failed") {
      return err(result.error ?? "workflow_failed", 500);
    }

    return ok({
      run_id: result.run_id,
      workflow_version_id: result.workflow_version_id,
      workflow_run_id: wfRun?.id,
      output: result.output,
    });
  } catch (e) {
    console.error(`POST /api/workflows/${id}/run: uncaught`, e);
    return err("internal_error", 500);
  }
}
