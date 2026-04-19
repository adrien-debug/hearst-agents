/**
 * Step Manager — CRUD + state transitions for RunSteps.
 *
 * All step operations go through here. No direct DB access for steps elsewhere.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  RunStep,
  CreateStepInput,
  StepStatus,
  StepError,
} from "./types";
import type { RunEventBus } from "../../events/bus";

export class StepManager {
  constructor(
    private db: SupabaseClient,
    private runId: string,
    private events: RunEventBus,
  ) {}

  async create(input: CreateStepInput): Promise<RunStep> {
    const seq = await this.nextSeq();
    const { data, error } = await this.db
      .from("run_steps")
      .insert({
        run_id: this.runId,
        parent_step_id: input.parent_step_id ?? null,
        seq,
        type: input.type,
        actor: input.actor,
        title: input.title,
        status: "pending" as const,
        input: input.input ?? null,
        retry_count: 0,
      })
      .select()
      .single();

    if (error) {
      console.error("[StepManager] create error:", error.message);
      throw new Error(`Failed to create step: ${error.message}`);
    }

    return data as RunStep;
  }

  async transition(stepId: string, status: StepStatus): Promise<void> {
    const update: Record<string, unknown> = { status };
    if (status === "running") {
      update.started_at = new Date().toISOString();
    }
    if (
      status === "completed" ||
      status === "failed" ||
      status === "skipped"
    ) {
      update.completed_at = new Date().toISOString();
    }
    const { error } = await this.db
      .from("run_steps")
      .update(update)
      .eq("id", stepId);

    if (error) {
      throw new Error(`[StepManager] transition to ${status} failed: ${error.message}`);
    }
  }

  async complete(
    stepId: string,
    result: { output?: unknown; artifacts?: unknown[] },
  ): Promise<void> {
    const { error } = await this.db
      .from("run_steps")
      .update({
        status: "completed" as const,
        output: (result.output ?? null) as Record<string, unknown> | null,
        completed_at: new Date().toISOString(),
      })
      .eq("id", stepId);

    if (error) {
      throw new Error(`[StepManager] complete failed: ${error.message}`);
    }
  }

  async fail(stepId: string, stepError: StepError): Promise<void> {
    const { error } = await this.db
      .from("run_steps")
      .update({
        status: "failed" as const,
        error: stepError as unknown as Record<string, unknown>,
        completed_at: new Date().toISOString(),
      })
      .eq("id", stepId);

    if (error) {
      throw new Error(`[StepManager] fail failed: ${error.message}`);
    }
  }

  async incrementRetry(stepId: string): Promise<number> {
    // Atomic increment
    const { data } = await this.db
      .from("run_steps")
      .select("retry_count")
      .eq("id", stepId)
      .single();

    const newCount = ((data as RunStep | null)?.retry_count ?? 0) + 1;
    await this.db
      .from("run_steps")
      .update({ retry_count: newCount, status: "pending" as const })
      .eq("id", stepId);

    return newCount;
  }

  async get(stepId: string): Promise<RunStep> {
    const { data, error } = await this.db
      .from("run_steps")
      .select()
      .eq("id", stepId)
      .single();

    if (error || !data) {
      throw new Error(`Step not found: ${stepId}`);
    }
    return data as RunStep;
  }

  async listForRun(): Promise<RunStep[]> {
    const { data } = await this.db
      .from("run_steps")
      .select()
      .eq("run_id", this.runId)
      .order("seq", { ascending: true });

    return (data ?? []) as RunStep[];
  }

  private async nextSeq(): Promise<number> {
    const { count } = await this.db
      .from("run_steps")
      .select("id", { count: "exact" })
      .eq("run_id", this.runId);
    return (count ?? 0) + 1;
  }
}
