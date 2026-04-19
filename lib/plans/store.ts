/**
 * Plan Store — CRUD for Plans and ActionPlans.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Plan,
  PlanStep,
  PlanStatus,
  PlanStepStatus,
  ActionPlan,
  ActionStep,
  ActionPlanStatus,
} from "./types";

export class PlanStore {
  constructor(private db: SupabaseClient) {}

  // ── Cognitive Plans ──────────────────────────────────────

  async createPlan(
    runId: string,
    reasoning: string,
    steps: Omit<PlanStep, "id" | "plan_id" | "status" | "run_step_id" | "completed_at">[],
  ): Promise<Plan> {
    const { data: plan, error } = await this.db
      .from("plans")
      .insert({ run_id: runId, reasoning, status: "active" })
      .select()
      .single();

    if (error) throw new Error(`Failed to create plan: ${error.message}`);

    if (steps.length > 0) {
      const stepRows = steps.map((s) => ({
        plan_id: plan!.id,
        order: s.order,
        intent: s.intent,
        agent: s.agent,
        task_description: s.task_description,
        expected_output: s.expected_output,
        retrieval_mode: s.retrieval_mode ?? null,
        depends_on: s.depends_on,
        optional: s.optional,
        status: "pending" as const,
      }));
      await this.db.from("plan_steps").insert(stepRows);
    }

    return this.loadPlan(plan!.id);
  }

  async loadPlan(planId: string): Promise<Plan> {
    const { data } = await this.db
      .from("plans")
      .select()
      .eq("id", planId)
      .single();

    if (!data) throw new Error(`Plan not found: ${planId}`);

    const { data: steps } = await this.db
      .from("plan_steps")
      .select()
      .eq("plan_id", planId)
      .order("order");

    return { ...(data as Omit<Plan, "steps">), steps: (steps ?? []) as PlanStep[] };
  }

  async transitionPlanStep(
    stepId: string,
    status: PlanStepStatus,
    runStepId?: string,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (runStepId) update.run_step_id = runStepId;
    if (status === "completed" || status === "failed" || status === "skipped") {
      update.completed_at = new Date().toISOString();
    }
    await this.db.from("plan_steps").update(update).eq("id", stepId);
  }

  async completePlan(planId: string): Promise<void> {
    await this.db
      .from("plans")
      .update({ status: "completed" as PlanStatus })
      .eq("id", planId);
  }

  // ── Action Plans ─────────────────────────────────────────

  async createActionPlan(
    runId: string,
    planId: string | null,
    createdBy: string,
    summary: string,
    actions: Omit<ActionStep, "id" | "action_plan_id" | "result" | "error" | "executed_at">[],
  ): Promise<ActionPlan> {
    const { data: ap, error } = await this.db
      .from("action_plans")
      .insert({
        run_id: runId,
        plan_id: planId,
        created_by: createdBy,
        summary,
        status: "proposed",
      })
      .select()
      .single();

    if (error) throw new Error(`Failed to create action plan: ${error.message}`);

    if (actions.length > 0) {
      const rows = actions.map((a) => ({
        action_plan_id: ap!.id,
        order: a.order,
        tool: a.tool,
        pack: a.pack,
        params: a.params,
        description: a.description,
        severity: a.severity,
        reversible: a.reversible,
        requires_approval: a.requires_approval,
        approval_status: a.approval_status,
        execution_status: a.execution_status,
        idempotency_key: a.idempotency_key,
      }));
      await this.db.from("action_plan_steps").insert(rows);
    }

    return this.loadActionPlan(ap!.id);
  }

  async loadActionPlan(id: string): Promise<ActionPlan> {
    const { data } = await this.db
      .from("action_plans")
      .select()
      .eq("id", id)
      .single();

    if (!data) throw new Error(`ActionPlan not found: ${id}`);

    const { data: actions } = await this.db
      .from("action_plan_steps")
      .select()
      .eq("action_plan_id", id)
      .order("order");

    return { ...(data as Omit<ActionPlan, "actions">), actions: (actions ?? []) as ActionStep[] };
  }

  async transitionActionPlan(
    id: string,
    status: ActionPlanStatus,
  ): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (["approved", "rejected", "partially_approved"].includes(status)) {
      update.decided_at = new Date().toISOString();
    }
    await this.db.from("action_plans").update(update).eq("id", id);
  }
}
