/**
 * Operator Executor — Executes an approved ActionPlan step-by-step.
 *
 * Guarantees:
 * - Only executes approved actions
 * - Validates every tool call against the ActionPlan via guard.ts
 * - Checks idempotency before execution
 * - Records every execution in action_executions table
 * - Never retries destructive actions automatically
 * - Reports errors without attempting fixes
 * - Emits events for every action
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunEngine } from "../../engine/runtime/engine";
import { getProviderForTool } from "@/lib/providers/registry";
import type { ActionPlan } from "@/lib/engine/runtime/plans/types";
import { PlanStore } from "@/lib/engine/runtime/plans/store";
import { validateToolCall, type ToolCallAttempt } from "./guard";

// ── Types ────────────────────────────────────────────────

export interface OperatorResult {
  status: "completed" | "partial" | "failed";
  executed: number;
  failed: number;
  skipped: number;
  results: ActionStepResult[];
}

export interface ActionStepResult {
  action_step_id: string;
  tool: string;
  status: "completed" | "failed" | "skipped";
  result?: Record<string, unknown>;
  error?: string;
}

export type ToolExecutor = (
  tool: string,
  params: Record<string, unknown>,
) => Promise<Record<string, unknown>>;

// ── Executor ─────────────────────────────────────────────

export async function executeActionPlan(
  db: SupabaseClient,
  engine: RunEngine,
  actionPlan: ActionPlan,
  executeTool: ToolExecutor,
): Promise<OperatorResult> {
  const store = new PlanStore(db);
  const results: ActionStepResult[] = [];
  let executed = 0;
  let failed = 0;
  let skipped = 0;

  // Mark plan as executing
  await store.transitionActionPlan(actionPlan.id, "executing");

  const sortedActions = [...actionPlan.actions].sort(
    (a, b) => a.order - b.order,
  );

  for (const action of sortedActions) {
    // ── Skip rejected actions ──────────────────────────────
    if (action.approval_status === "rejected") {
      skipped++;
      await updateActionStep(db, action.id, "skipped");
      results.push({
        action_step_id: action.id,
        tool: action.tool,
        status: "skipped",
      });
      continue;
    }

    // ── Validate via guard ─────────────────────────────────
    const attempt: ToolCallAttempt = {
      tool: action.tool,
      params: action.params,
    };

    const validation = validateToolCall(attempt, actionPlan);
    if (!validation.valid) {
      engine.events.emit({
        type: "operator_violation",
        run_id: engine.id,
        step_id: action.id,
        tool: action.tool,
        violation: validation.violation,
      });

      // Already executed → skip silently (idempotent)
      if (validation.violation_type === "action_already_executed") {
        skipped++;
        results.push({
          action_step_id: action.id,
          tool: action.tool,
          status: "skipped",
          error: validation.violation,
        });
        continue;
      }

      // Other violations → fail
      failed++;
      await updateActionStep(db, action.id, "failed", undefined, {
        code: validation.violation_type,
        message: validation.violation,
      });
      results.push({
        action_step_id: action.id,
        tool: action.tool,
        status: "failed",
        error: validation.violation,
      });
      continue;
    }

    // ── Idempotency check ──────────────────────────────────
    const existing = await checkIdempotency(
      db,
      action.idempotency_key,
    );
    if (existing) {
      skipped++;
      await updateActionStep(db, action.id, "completed", existing);
      results.push({
        action_step_id: action.id,
        tool: action.tool,
        status: "completed",
        result: existing,
      });
      continue;
    }

    // ── Create execution record ────────────────────────────
    const execId = await createExecution(db, {
      action_step_id: action.id,
      run_id: engine.id,
      tool: action.tool,
      params: action.params,
      idempotency_key: action.idempotency_key,
    });

    // ── Execute ────────────────────────────────────────────
    await updateActionStep(db, action.id, "running");

    const toolProvider = getProviderForTool(action.tool);
    engine.events.emit({
      type: "tool_call_started",
      run_id: engine.id,
      step_id: action.id,
      tool: action.tool,
      providerId: toolProvider?.id,
      providerLabel: toolProvider?.label,
    });

    try {
      const result = await executeTool(action.tool, action.params);

      await completeExecution(db, execId, result);
      await updateActionStep(db, action.id, "completed", result);
      executed++;

      engine.events.emit({
        type: "tool_call_completed",
        run_id: engine.id,
        step_id: action.id,
        tool: action.tool,
        providerId: toolProvider?.id,
      });

      results.push({
        action_step_id: action.id,
        tool: action.tool,
        status: "completed",
        result,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Tool execution failed";

      await failExecution(db, execId, msg);
      await updateActionStep(db, action.id, "failed", undefined, {
        code: "TOOL_FAILED",
        message: msg,
      });
      failed++;

      engine.events.emit({
        type: "step_failed",
        run_id: engine.id,
        step_id: action.id,
        error: msg,
      });

      results.push({
        action_step_id: action.id,
        tool: action.tool,
        status: "failed",
        error: msg,
      });

      // Do NOT break on failure — continue to next action
    }
  }

  await store.transitionActionPlan(
    actionPlan.id,
    failed === 0 ? "completed" : "failed",
  );

  return {
    status: failed === 0 ? "completed" : executed > 0 ? "partial" : "failed",
    executed,
    failed,
    skipped,
    results,
  };
}

// ── DB helpers ───────────────────────────────────────────

async function updateActionStep(
  db: SupabaseClient,
  actionStepId: string,
  executionStatus: string,
  result?: Record<string, unknown>,
  error?: Record<string, unknown>,
): Promise<void> {
  const update: Record<string, unknown> = {
    execution_status: executionStatus,
  };
  if (result) update.result = result;
  if (error) update.error = error;
  if (
    executionStatus === "completed" ||
    executionStatus === "failed" ||
    executionStatus === "skipped"
  ) {
    update.executed_at = new Date().toISOString();
  }

  const { error: dbErr } = await db
    .from("action_plan_steps")
    .update(update)
    .eq("id", actionStepId);

  if (dbErr) {
    console.error("[Operator] updateActionStep error:", dbErr.message);
  }
}

async function checkIdempotency(
  db: SupabaseClient,
  idempotencyKey: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await db
    .from("action_executions")
    .select("result")
    .eq("idempotency_key", idempotencyKey)
    .eq("status", "completed")
    .single();

  return (data?.result as Record<string, unknown>) ?? null;
}

interface CreateExecutionInput {
  action_step_id: string;
  run_id: string;
  tool: string;
  params: Record<string, unknown>;
  idempotency_key: string;
}

async function createExecution(
  db: SupabaseClient,
  input: CreateExecutionInput,
): Promise<string> {
  // Need a step_id — use action_step_id as reference
  const { data, error } = await db
    .from("action_executions")
    .insert({
      action_step_id: input.action_step_id,
      run_id: input.run_id,
      step_id: input.action_step_id,
      tool: input.tool,
      params: input.params,
      idempotency_key: input.idempotency_key,
      status: "running",
    })
    .select("id")
    .single();

  if (error) {
    console.error("[Operator] createExecution error:", error.message);
    throw new Error(`Failed to create execution: ${error.message}`);
  }

  return data!.id;
}

async function completeExecution(
  db: SupabaseClient,
  executionId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await db
    .from("action_executions")
    .update({
      status: "completed",
      result,
      completed_at: new Date().toISOString(),
    })
    .eq("id", executionId);
}

async function failExecution(
  db: SupabaseClient,
  executionId: string,
  error: string,
): Promise<void> {
  await db
    .from("action_executions")
    .update({
      status: "failed",
      error,
      completed_at: new Date().toISOString(),
    })
    .eq("id", executionId);
}
