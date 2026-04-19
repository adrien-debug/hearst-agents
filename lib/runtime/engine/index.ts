/**
 * Run Engine — Façade for the v2 runtime.
 *
 * Centralizes Run lifecycle, sub-managers, and event emission.
 * No code outside RunEngine should write directly to run-related tables.
 *
 * Coexists with the legacy RunTracer (lib/runtime/tracer.ts).
 * In Phase 1, both are used in /api/chat. Phase 3 retires RunTracer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  EngineRunStatus,
  CreateRunInput,
  RunCost,
} from "./types";
import type { ArtifactRef } from "../../artifacts/types";
import { StepManager } from "./step-manager";
import { ApprovalManager } from "./approval-manager";
import { ArtifactManager } from "./artifact-manager";
import { CostTracker } from "./cost-tracker";
import { RunEventBus } from "../../events/bus";

const EMPTY_COST: RunCost = {
  llm_input_tokens: 0,
  llm_output_tokens: 0,
  tool_calls: 0,
};

const ALLOWED_TRANSITIONS: Record<EngineRunStatus, EngineRunStatus[]> = {
  created: ["running", "cancelled"],
  running: [
    "completed",
    "failed",
    "cancelled",
    "awaiting_approval",
    "awaiting_clarification",
  ],
  awaiting_approval: ["running", "cancelled", "failed"],
  awaiting_clarification: ["running", "cancelled", "failed"],
  completed: [],
  failed: [],
  cancelled: [],
};

export class RunEngine {
  readonly steps: StepManager;
  readonly approvals: ApprovalManager;
  readonly artifacts: ArtifactManager;
  readonly cost: CostTracker;
  readonly events: RunEventBus;

  private db: SupabaseClient;
  private runId: string;
  private status: EngineRunStatus;
  private userId: string;

  private constructor(
    db: SupabaseClient,
    runId: string,
    userId: string,
    eventBus: RunEventBus,
  ) {
    this.db = db;
    this.runId = runId;
    this.userId = userId;
    this.status = "created";
    this.events = eventBus;
    this.steps = new StepManager(db, runId, eventBus);
    this.approvals = new ApprovalManager(db, runId, eventBus);
    this.artifacts = new ArtifactManager(db, runId);
    this.cost = new CostTracker(db, runId);
  }

  // ── Factory ──────────────────────────────────────────────

  static async create(
    db: SupabaseClient,
    input: CreateRunInput,
    eventBus: RunEventBus,
  ): Promise<RunEngine> {
    const { data, error } = await db
      .from("runs")
      .insert({
        kind: "chat" as const,
        status: "created" as const,
        trigger: "api" as const,
        input: input.request as Record<string, unknown>,
        // v2 columns
        user_id: input.user_id,
        entrypoint: input.entrypoint,
        request: input.request as Record<string, unknown>,
        cost: EMPTY_COST as unknown as Record<string, unknown>,
        started_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      console.error("[RunEngine] create error:", error.message);
      throw new Error(`Failed to create run: ${error.message}`);
    }

    const engine = new RunEngine(db, data!.id, input.user_id, eventBus);
    eventBus.emit({ type: "run_created", run_id: data!.id });
    return engine;
  }

  /**
   * Load an existing Run (for resume scenarios).
   */
  static async load(
    db: SupabaseClient,
    runId: string,
    eventBus: RunEventBus,
  ): Promise<RunEngine> {
    const { data, error } = await db
      .from("runs")
      .select("id, user_id, status")
      .eq("id", runId)
      .single();

    if (error || !data) {
      throw new Error(`Run not found: ${runId}`);
    }

    const engine = new RunEngine(
      db,
      data.id,
      (data as Record<string, unknown>).user_id as string,
      eventBus,
    );
    engine.status =
      (data.status as EngineRunStatus) ?? "created";
    return engine;
  }

  // ── Run lifecycle ────────────────────────────────────────

  async start(): Promise<void> {
    await this.transition("running");
    this.events.emit({ type: "run_started", run_id: this.runId });
  }

  async complete(): Promise<void> {
    await this.transition("completed");
    const artifactRefs = await this.artifacts.listRefs(this.runId);
    this.events.emit({
      type: "run_completed",
      run_id: this.runId,
      artifacts: artifactRefs,
    });
  }

  async fail(error: string): Promise<void> {
    await this.transition("failed");
    this.events.emit({
      type: "run_failed",
      run_id: this.runId,
      error,
    });
  }

  async suspend(
    reason: "awaiting_approval" | "awaiting_clarification",
  ): Promise<void> {
    await this.transition(reason);
    this.events.emit({
      type: "run_suspended",
      run_id: this.runId,
      reason,
    });
  }

  async resume(): Promise<void> {
    await this.transition("running");
    this.events.emit({ type: "run_resumed", run_id: this.runId });
  }

  async cancel(): Promise<void> {
    await this.transition("cancelled");
    this.events.emit({ type: "run_cancelled", run_id: this.runId });
  }

  // ── Plan attachment ──────────────────────────────────────

  async attachPlanId(planId: string, stepCount: number): Promise<void> {
    await this.db
      .from("runs")
      .update({
        current_plan_id: planId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.runId);

    this.events.emit({
      type: "plan_attached",
      run_id: this.runId,
      plan_id: planId,
      step_count: stepCount,
    });
  }

  async attachActionPlanId(actionPlanId: string): Promise<void> {
    await this.db
      .from("runs")
      .update({
        current_action_plan_id: actionPlanId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", this.runId);
  }

  // ── Accessors ────────────────────────────────────────────

  get id(): string {
    return this.runId;
  }

  getStatus(): EngineRunStatus {
    return this.status;
  }

  getUserId(): string {
    return this.userId;
  }

  getDb(): SupabaseClient {
    return this.db;
  }

  // ── Private ──────────────────────────────────────────────

  private async transition(target: EngineRunStatus): Promise<void> {
    const allowed = ALLOWED_TRANSITIONS[this.status];
    if (!allowed?.includes(target)) {
      throw new Error(
        `Invalid run transition: ${this.status} → ${target}`,
      );
    }

    const update: Record<string, unknown> = {
      status: target,
      updated_at: new Date().toISOString(),
    };
    if (
      target === "completed" ||
      target === "failed" ||
      target === "cancelled"
    ) {
      update.finished_at = new Date().toISOString();
    }

    const { error } = await this.db
      .from("runs")
      .update(update)
      .eq("id", this.runId);

    if (error) {
      throw new Error(
        `[RunEngine] transition ${this.status} → ${target} failed: ${error.message}`,
      );
    }

    this.status = target;
  }
}
