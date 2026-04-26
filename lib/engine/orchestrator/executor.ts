/**
 * Orchestrator Executor — Runs a Plan step-by-step via delegate().
 *
 * Handles:
 * - Sequential execution respecting depends_on
 * - Status handling (success, error, enqueued, needs_approval, needs_clarification)
 * - Optional step failure tolerance
 * - Run suspension on approval/clarification
 * - Event emission for every action
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Plan, PlanStep } from "@/lib/engine/runtime/plans/types";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type {
  DelegateResult,
  DelegateSuccess,
  CapabilityAgent,
  ExpectedOutput,
} from "@/lib/engine/runtime/delegate/types";
import { delegate } from "@/lib/engine/runtime/delegate/api";
import { PlanStore } from "@/lib/engine/runtime/plans/store";
import { evaluateForArtifact } from "@/lib/artifacts/evaluator";

export interface ExecutionResult {
  status: "completed" | "suspended" | "failed";
  completedSteps: string[];
  failedSteps: string[];
  suspendedAt?: {
    step_id: string;
    reason: "needs_approval" | "needs_clarification";
  };
  error?: string;
}

export async function executePlan(
  db: SupabaseClient,
  engine: RunEngine,
  plan: Plan,
  capabilityDomain?: string,
): Promise<ExecutionResult> {
  const store = new PlanStore(db);
  const completedSteps: string[] = [];
  const failedSteps: string[] = [];
  const completedStepIds = new Set<string>();

  const sortedSteps = [...plan.steps].sort((a, b) => a.order - b.order);

  for (const planStep of sortedSteps) {
    // ── Check dependencies ──────────────────────────────────
    if (planStep.depends_on.length > 0) {
      const unmetDeps = planStep.depends_on.filter(
        (depId) => !completedStepIds.has(depId),
      );
      if (unmetDeps.length > 0) {
        if (planStep.optional) {
          await store.transitionPlanStep(planStep.id, "skipped");
          continue;
        }
        const msg = `Step "${planStep.intent}" has unmet dependencies`;
        console.error("[Executor]", msg);
        await store.transitionPlanStep(planStep.id, "failed");
        failedSteps.push(planStep.id);
        continue;
      }
    }

    // ── Execute via delegate() ──────────────────────────────
    await store.transitionPlanStep(planStep.id, "running");

    let result: DelegateResult;
    try {
      result = await delegate(engine, {
        run_id: engine.id,
        agent: planStep.agent as CapabilityAgent,
        task: planStep.task_description,
        context: {
          intent: planStep.intent,
          plan_id: plan.id,
          plan_step_id: planStep.id,
          completed_steps: completedSteps,
          ...(capabilityDomain ? { capability_domain: capabilityDomain } : {}),
        },
        expected_output: planStep.expected_output as ExpectedOutput,
        retrieval_mode: planStep.retrieval_mode,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Delegate call failed";
      console.error("[Executor] delegate error:", msg);
      await store.transitionPlanStep(planStep.id, "failed");
      failedSteps.push(planStep.id);
      if (!planStep.optional) {
        return {
          status: "failed",
          completedSteps,
          failedSteps,
          error: `Step "${planStep.intent}" failed: ${msg}`,
        };
      }
      continue;
    }

    // ── Handle delegate result ──────────────────────────────
    switch (result.status) {
      case "success": {
        await store.transitionPlanStep(
          planStep.id,
          "completed",
          result.step_id,
        );
        completedSteps.push(planStep.id);
        completedStepIds.add(planStep.id);

        // ── Artifact evaluation ──────────────────────────────
        await maybeCreateArtifact(engine, planStep, result);
        break;
      }

      case "enqueued": {
        // Don't block — mark as running and continue
        // The worker will complete it asynchronously
        completedStepIds.add(planStep.id);
        break;
      }

      case "needs_approval": {
        await engine.suspend("awaiting_approval");
        return {
          status: "suspended",
          completedSteps,
          failedSteps,
          suspendedAt: {
            step_id: result.step_id,
            reason: "needs_approval",
          },
        };
      }

      case "needs_clarification": {
        engine.events.emit({
          type: "clarification_requested",
          run_id: engine.id,
          question: result.question,
          options: result.options,
        });
        await engine.suspend("awaiting_clarification");
        return {
          status: "suspended",
          completedSteps,
          failedSteps,
          suspendedAt: {
            step_id: result.step_id,
            reason: "needs_clarification",
          },
        };
      }

      case "error": {
        await store.transitionPlanStep(planStep.id, "failed");
        failedSteps.push(planStep.id);

        if (result.error.retryable) {
          engine.events.emit({
            type: "runtime_warning",
            run_id: engine.id,
            message: `Step "${planStep.intent}" failed (retryable): ${result.error.message}`,
          });
        }

        if (!planStep.optional) {
          return {
            status: "failed",
            completedSteps,
            failedSteps,
            error: `Step "${planStep.intent}": ${result.error.message}`,
          };
        }
        break;
      }
    }
  }

  // ── All steps processed ──────────────────────────────────
  await store.completePlan(plan.id);

  return {
    status: "completed",
    completedSteps,
    failedSteps,
  };
}

// ── Artifact evaluation after step success ───────────────

async function maybeCreateArtifact(
  engine: RunEngine,
  planStep: PlanStep,
  result: DelegateSuccess,
): Promise<void> {
  // Skip if the agent already produced artifacts (DocBuilder handles its own)
  if (result.artifacts && result.artifacts.length > 0) return;

  const content = extractContent(result.data);
  if (!content) return;

  const needsArtifact =
    (planStep as unknown as Record<string, unknown>).needs_artifact === true;

  const evaluation = evaluateForArtifact({
    content,
    expectedOutput: planStep.expected_output as ExpectedOutput,
    agent: planStep.agent,
    planStepIntent: planStep.intent,
    needsArtifact,
  });

  if (!evaluation.shouldCreate) return;

  try {
    const artifact = await engine.artifacts.create(
      {
        user_id: engine.getUserId(),
        type: evaluation.suggestedType,
        title: evaluation.suggestedTitle,
        content,
        format: "markdown",
        metadata: { word_count: content.split(/\s+/).filter(Boolean).length },
        created_by: planStep.agent,
      },
      engine.id,
    );

    engine.events.emit({
      type: "artifact_created",
      run_id: engine.id,
      artifact_id: artifact.id,
      artifact_type: evaluation.suggestedType,
      title: evaluation.suggestedTitle,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Artifact creation failed";
    console.error("[Executor] artifact creation error:", msg);
    engine.events.emit({
      type: "runtime_warning",
      run_id: engine.id,
      message: `Artifact creation failed for step "${planStep.intent}": ${msg}`,
    });
  }
}

function extractContent(data: Record<string, unknown>): string | null {
  if (typeof data.content === "string" && data.content) return data.content;
  if (typeof data.text === "string" && data.text) return data.text;
  if (typeof data.result === "string" && data.result) return data.result;
  if (typeof data.message === "string" && data.message.length > 200)
    return data.message;
  return null;
}
