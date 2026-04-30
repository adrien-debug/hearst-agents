/**
 * Plan Executor — Runs ExecutionPlan steps respecting dependencies and approval gates.
 *
 * Separation:
 * - Planner decided WHAT (steps, order, gates)
 * - Resolver decides WITH WHAT (provider, called per-step at execution time)
 * - Executor decides NOW (this module)
 *
 * Rules:
 * - No execution without a plan object
 * - Steps respect dependency order
 * - Failed step can mark plan as degraded
 * - Approval gate pauses execution until approved
 * - Completed plan can produce assets + actions
 */

import type { ExecutionPlan, ExecutionPlanStep } from "./types";
import { getReadySteps, isPlanTerminal } from "./types";
import { getPlan, savePlan } from "./store";
import { logPlanEvent } from "./debug";
import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { ProviderId } from "@/lib/providers/types";

// ── Types ───────────────────────────────────────────────────

export interface StepExecutionResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
  /** Asset produced by this step, if any. */
  assetId?: string;
}

/**
 * Callback to resolve a provider for a capability at execution time.
 * The planner does NOT choose providers — the resolver does.
 */
export type CapabilityResolver = (
  capability: ConnectorCapability,
) => Promise<{ providerId: ProviderId; tool?: string } | null>;

/**
 * Callback to execute a single tool call.
 */
export type ToolExecutorFn = (
  tool: string,
  params: Record<string, unknown>,
  providerId: ProviderId,
) => Promise<StepExecutionResult>;

/**
 * Callback invoked when the plan reaches an approval gate.
 */
export type ApprovalRequestFn = (planId: string, stepId: string) => void;

export interface ExecutorCallbacks {
  resolveCapability: CapabilityResolver;
  executeTool: ToolExecutorFn;
  onApprovalRequired: ApprovalRequestFn;
  /** Émis juste avant l'exécution d'un step (status passe à running). */
  onStepStarted?: (planId: string, step: ExecutionPlanStep) => void;
  onStepCompleted?: (planId: string, step: ExecutionPlanStep) => void;
  onPlanCompleted?: (plan: ExecutionPlan) => void;
  onPlanDegraded?: (plan: ExecutionPlan, failedStep: ExecutionPlanStep) => void;
}

// ── Executor ────────────────────────────────────────────────

export async function executePlan(
  planId: string,
  callbacks: ExecutorCallbacks,
): Promise<ExecutionPlan | null> {
  const plan = getPlan(planId);
  if (!plan || isPlanTerminal(plan.status)) return plan;

  if (plan.status === "draft" || plan.status === "ready") {
    plan.status = "executing";
    plan.updatedAt = Date.now();
    savePlan(plan);
    logPlanEvent("plan_execution_started", { planId });
  }

  let iterations = 0;
  const maxIterations = plan.steps.length + 1;

  while (iterations++ < maxIterations) {
    const ready = getReadySteps(plan);
    if (ready.length === 0) break;

    for (const step of ready) {
      // Approval gate — pause and notify
      if (step.kind === "wait_for_approval") {
        plan.status = "awaiting_approval";
        plan.updatedAt = Date.now();
        savePlan(plan);
        callbacks.onApprovalRequired(planId, step.id);
        logPlanEvent("approval_gate_reached", { planId, stepId: step.id });
        return plan;
      }

      await executeStep(plan, step, callbacks);
    }
  }

  // Check final status
  const allDone = plan.steps.every((s) => s.status === "done" || s.status === "skipped");
  const anyFailed = plan.steps.some((s) => s.status === "failed");

  if (allDone) {
    plan.status = "completed";
    logPlanEvent("plan_completed", { planId });
    callbacks.onPlanCompleted?.(plan);
  } else if (anyFailed) {
    const critical = plan.steps.filter((s) => s.status === "failed" && s.risk !== "low");
    plan.status = critical.length > 0 ? "failed" : "degraded";
    logPlanEvent("plan_degraded_or_failed", { planId, status: plan.status });
    const failedStep = plan.steps.find((s) => s.status === "failed");
    if (failedStep) callbacks.onPlanDegraded?.(plan, failedStep);
  }

  plan.updatedAt = Date.now();
  savePlan(plan);
  return plan;
}

// ── Step execution ──────────────────────────────────────────

async function executeStep(
  plan: ExecutionPlan,
  step: ExecutionPlanStep,
  callbacks: ExecutorCallbacks,
): Promise<void> {
  step.status = "running";
  step.startedAt = Date.now();
  plan.updatedAt = Date.now();
  savePlan(plan);
  logPlanEvent("step_started", { planId: plan.id, stepId: step.id, kind: step.kind });
  callbacks.onStepStarted?.(plan.id, step);

  // Steps that don't need tool execution
  if (step.kind === "analyze" || step.kind === "synthesize" || step.kind === "monitor") {
    step.status = "done";
    step.completedAt = Date.now();
    savePlan(plan);
    logPlanEvent("step_completed", { planId: plan.id, stepId: step.id });
    callbacks.onStepCompleted?.(plan.id, step);
    return;
  }

  // Resolve provider if capability is specified and no provider yet
  if (step.capability && !step.providerId) {
    const resolution = await callbacks.resolveCapability(step.capability);
    if (!resolution) {
      step.status = "failed";
      step.error = `No provider available for capability: ${step.capability}`;
      step.completedAt = Date.now();
      savePlan(plan);
      logPlanEvent("step_failed", { planId: plan.id, stepId: step.id, error: step.error });
      return;
    }
    step.providerId = resolution.providerId;
    if (resolution.tool && !step.tool) step.tool = resolution.tool;
  }

  // Execute tool
  const tool = step.tool ?? step.kind;
  const providerId = step.providerId ?? ("system" as ProviderId);

  try {
    const result = await callbacks.executeTool(tool, { intent: plan.intent, expectedOutput: step.expectedOutput }, providerId);

    if (result.success) {
      step.status = "done";
      step.result = result.data;
      step.completedAt = Date.now();
      logPlanEvent("step_completed", { planId: plan.id, stepId: step.id, assetId: result.assetId });
      callbacks.onStepCompleted?.(plan.id, step);
    } else {
      step.status = "failed";
      step.error = result.error ?? "Unknown error";
      step.completedAt = Date.now();
      logPlanEvent("step_failed", { planId: plan.id, stepId: step.id, error: step.error });
    }
  } catch (err) {
    step.status = "failed";
    step.error = err instanceof Error ? err.message : "Execution error";
    step.completedAt = Date.now();
    logPlanEvent("step_failed", { planId: plan.id, stepId: step.id, error: step.error });
  }

  savePlan(plan);
}
