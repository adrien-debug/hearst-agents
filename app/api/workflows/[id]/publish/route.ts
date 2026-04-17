import { NextRequest } from "next/server";
import { requireServerSupabase } from "@/lib/supabase-server";
import { ok, err, dbErr, parseBody } from "@/lib/domain";
import type { Json } from "@/lib/database.types";
import { z } from "zod";

export const dynamic = "force-dynamic";

const publishSchema = z.object({
  changelog: z.string().max(2000).optional(),
  published_by: z.string().max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await req.json();
  } catch {
    // empty body ok
  }

  const parsed = parseBody(publishSchema, body);
  if (!parsed.success) return parsed.response;

  try {
    const sb = requireServerSupabase();

    const { data: workflow, error: wfErr } = await sb
      .from("workflows")
      .select("*")
      .eq("id", id)
      .single();

    if (wfErr || !workflow) return err("workflow_not_found", 404);

    const { data: steps, error: stepsErr } = await sb
      .from("workflow_steps")
      .select("id, step_order, action_type, config, agent_id, on_success_step_id, on_failure_step_id")
      .eq("workflow_id", id)
      .order("step_order", { ascending: true });

    if (stepsErr) return dbErr(`POST /api/workflows/${id}/publish`, stepsErr);
    if (!steps || steps.length === 0) return err("Cannot publish workflow with no steps", 400);

    const nextVersion = workflow.version + 1;

    const stepsSnapshot = steps.map((s) => ({
      id: s.id,
      step_order: s.step_order,
      action_type: s.action_type,
      config: s.config,
      agent_id: s.agent_id,
      on_success_step_id: s.on_success_step_id,
      on_failure_step_id: s.on_failure_step_id,
    }));

    const configSnapshot = {
      name: workflow.name,
      description: workflow.description,
      trigger_type: workflow.trigger_type,
      status: workflow.status,
    };

    const { data: versionData, error: vErr } = await sb
      .from("workflow_versions")
      .insert({
        workflow_id: id,
        version: nextVersion,
        steps_snapshot: stepsSnapshot as unknown as Json,
        config_snapshot: configSnapshot as unknown as Json,
        changelog: parsed.data.changelog ?? null,
        published_by: parsed.data.published_by ?? null,
      })
      .select("id")
      .single();

    if (vErr) return dbErr(`POST /api/workflows/${id}/publish`, vErr);

    await sb
      .from("workflows")
      .update({
        version: nextVersion,
        active_version_id: versionData?.id ?? null,
      })
      .eq("id", id);

    return ok({
      workflow_version_id: versionData?.id,
      version: nextVersion,
      steps_count: steps.length,
    }, 201);
  } catch (e) {
    console.error(`POST /api/workflows/${id}/publish: uncaught`, e);
    return err("internal_error", 500);
  }
}
