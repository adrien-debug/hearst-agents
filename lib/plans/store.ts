/**
 * Plan Store — Persistence layer for cognitive plans.
 *
 * Stores plans and plan_steps in Supabase.
 * Bridge between orchestrator planning and database.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan, PlanStep } from "./types";

export class PlanStore {
  private db: SupabaseClient;

  constructor(db: SupabaseClient) {
    this.db = db;
  }

  /**
   * Create a new plan with steps.
   */
  async createPlan(
    runId: string,
    reasoning: string,
    steps: Array<{
      intent: string;
      agent: string;
      task_description: string;
      expected_output: string;
      retrieval_mode?: string;
      depends_on?: string[];
      optional?: boolean;
    }>,
  ): Promise<Plan> {
    const { data: plan, error: planError } = await this.db
      .from("plans")
      .insert({
        run_id: runId,
        reasoning,
        status: "active",
      })
      .select("id")
      .single();

    if (planError || !plan) {
      throw new Error(`Failed to create plan: ${planError?.message}`);
    }

    const planId = plan.id;

    // Insert steps
    if (steps.length > 0) {
      const { error: stepsError } = await this.db.from("plan_steps").insert(
        steps.map((s, idx) => ({
          plan_id: planId,
          order: idx,
          intent: s.intent,
          agent: s.agent,
          task_description: s.task_description,
          expected_output: s.expected_output,
          retrieval_mode: s.retrieval_mode,
          depends_on: s.depends_on,
          optional: s.optional,
          status: "pending",
        })),
      );

      if (stepsError) {
        throw new Error(`Failed to create plan steps: ${stepsError.message}`);
      }
    }

    // Return plan with steps
    const { data: stepsData, error: stepsFetchError } = await this.db
      .from("plan_steps")
      .select("*")
      .eq("plan_id", planId)
      .order("order", { ascending: true });

    if (stepsFetchError) {
      throw new Error(`Failed to fetch steps: ${stepsFetchError.message}`);
    }

    return {
      id: planId,
      run_id: runId,
      reasoning,
      status: "active",
      steps: (stepsData ?? []) as PlanStep[],
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Get plan with steps by run ID.
   */
  async getPlanByRunId(runId: string): Promise<Plan | null> {
    const { data: plan, error: planError } = await this.db
      .from("plans")
      .select("*")
      .eq("run_id", runId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (planError || !plan) return null;

    const { data: steps, error: stepsError } = await this.db
      .from("plan_steps")
      .select("*")
      .eq("plan_id", plan.id)
      .order("order", { ascending: true });

    if (stepsError) {
      throw new Error(`Failed to fetch plan steps: ${stepsError.message}`);
    }

    return {
      ...plan,
      steps: steps ?? [],
    };
  }

  /**
   * Update step status.
   */
  async updateStepStatus(
    stepId: string,
    status: PlanStep["status"],
    runStepId?: string,
  ): Promise<void> {
    const update: Partial<PlanStep> = { status };
    if (runStepId) update.run_step_id = runStepId;
    if (status === "completed") update.completed_at = new Date().toISOString();

    const { error } = await this.db
      .from("plan_steps")
      .update(update)
      .eq("id", stepId);

    if (error) {
      throw new Error(`Failed to update step: ${error.message}`);
    }
  }

  /**
   * Mark plan as completed.
   */
  async completePlan(planId: string): Promise<void> {
    const { error } = await this.db
      .from("plans")
      .update({ status: "completed" })
      .eq("id", planId);

    if (error) {
      throw new Error(`Failed to complete plan: ${error.message}`);
    }
  }

  /**
   * Mark plan as abandoned.
   */
  async abandonPlan(planId: string): Promise<void> {
    const { error } = await this.db
      .from("plans")
      .update({ status: "abandoned" })
      .eq("id", planId);

    if (error) {
      throw new Error(`Failed to abandon plan: ${error.message}`);
    }
  }

  /**
   * Transition a plan step to a new status.
   * (Alias for updateStepStatus for API compatibility)
   */
  async transitionPlanStep(
    stepId: string,
    status: PlanStep["status"],
    runStepId?: string,
  ): Promise<void> {
    return this.updateStepStatus(stepId, status, runStepId);
  }

  /**
   * Transition an action plan to a new status.
   */
  async transitionActionPlan(
    actionPlanId: string,
    status: string,
  ): Promise<void> {
    const { error } = await this.db
      .from("action_plans")
      .update({ status })
      .eq("id", actionPlanId);

    if (error) {
      throw new Error(`Failed to transition action plan: ${error.message}`);
    }
  }
}
