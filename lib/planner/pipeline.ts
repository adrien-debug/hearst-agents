/**
 * Execution Pipeline — The complete intent → focal object flow.
 *
 * This is the single entry point for executing user intents in HEARST OS.
 *
 * Flow:
 *   intent → createPlanFromIntent()
 *   → executePlan() with resolver + tool callbacks
 *   → raw outputs collected per step
 *   → formatOutput() for structured content
 *   → storeAsset() + storeAction()
 *   → manifestPlan() / manifestAsset() → FocalObject
 *
 * The user NEVER sees: tools, providers, steps, raw data.
 * They see: final FocalObject or approval FocalObject.
 *
 * Error policy:
 * - Provider failure → silent fallback via resolver
 * - All providers fail → unified failure message (never raw error)
 */

import type { ProviderId } from "@/lib/providers/types";
import type { ConnectorCapability } from "@/lib/connectors/platform/types";
import type { FocalObject } from "@/lib/right-panel/objects";
import type { ExecutionPlan } from "./types";
import { createPlanFromIntent, approvePlan } from "./index";
import { executePlan } from "./executor";
import type { ExecutorCallbacks, StepExecutionResult } from "./executor";
import { resolveProvider, resolveFallback } from "@/lib/providers/resolver";
import { recordProviderSuccess, recordProviderFailure } from "@/lib/providers/state";
import { formatOutput, detectOutputTier } from "@/lib/engine/runtime/formatting/pipeline";
import { storeAsset, storeAction, type Asset } from "@/lib/assets/types";
import { handleSendMessage } from "@/lib/tools/handlers/send-message";
import { manifestPlan, manifestAsset } from "@/lib/right-panel/manifestation";
import { logPlanEvent } from "./debug";

// ── Types ───────────────────────────────────────────────────

export interface PipelineContext {
  userId: string;
  tenantId: string;
  workspaceId?: string;
  threadId: string;
  connectedProviders: ProviderId[];
  forcedProviderId?: ProviderId;
}

export interface PipelineResult {
  plan: ExecutionPlan;
  focalObject: FocalObject | null;
  /** Raw step outputs (for secondary hydration if needed). */
  stepOutputs: Map<string, Record<string, unknown>>;
  /** Assets produced during execution. */
  assets: Asset[];
}

type PipelineEventType =
  | "plan_created"
  | "step_executing"
  | "step_completed"
  | "approval_required"
  | "plan_completed"
  | "plan_failed";

export type PipelineListener = (event: PipelineEventType, data: Record<string, unknown>) => void;

// ── Pipeline entry point ────────────────────────────────────

export async function executeIntent(
  intent: string,
  ctx: PipelineContext,
  listener?: PipelineListener,
): Promise<PipelineResult> {
  const stepOutputs = new Map<string, Record<string, unknown>>();
  const producedAssets: Asset[] = [];
  const failedProviders: ProviderId[] = [];

  // 1. Create plan
  const plan = createPlanFromIntent({
    intent,
    threadId: ctx.threadId,
    userId: ctx.userId,
    tenantId: ctx.tenantId,
    forcedProviderId: ctx.forcedProviderId,
  });

  listener?.("plan_created", { planId: plan.id, type: plan.type, stepCount: plan.steps.length });

  // 2. Build executor callbacks
  const callbacks: ExecutorCallbacks = {
    resolveCapability: async (capability: ConnectorCapability) => {
      const result = resolveProvider({
        capability,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        connectedProviders: ctx.connectedProviders,
        forcedProviderId: ctx.forcedProviderId,
      });

      if (!result) return null;
      const firstTool = result.provider.tools[0];
      return { providerId: result.provider.id, tool: firstTool };
    },

    executeTool: async (tool, params, providerId): Promise<StepExecutionResult> => {
      listener?.("step_executing", { tool, providerId });

      try {
        const result = await executeToolCall(tool, params, providerId, ctx, failedProviders);

        if (result.success) {
          recordProviderSuccess(providerId, ctx.userId, ctx.tenantId);
          if (result.data) {
            stepOutputs.set(tool, result.data);
          }

          // If this step produced content, create an asset
          if (result.data?.content && tool !== "send_message") {
            const tier = detectOutputTier(intent);
            const formatted = formatOutput(result.data.content as string, tier);
            const asset = createAssetFromOutput(ctx.threadId, formatted.title, tier, providerId, result.assetId);
            storeAsset(asset);
            producedAssets.push(asset);
          }

          return result;
        }

        // Failure: try fallback
        recordProviderFailure(providerId, ctx.userId, ctx.tenantId);
        failedProviders.push(providerId);

        const fallback = resolveFallback({
          capability: (params.capability as ConnectorCapability) ?? "messaging",
          userId: ctx.userId,
          tenantId: ctx.tenantId,
          connectedProviders: ctx.connectedProviders,
        }, failedProviders);

        if (fallback && !fallback.degraded) {
          logPlanEvent("fallback_attempt", { from: providerId, to: fallback.provider.id });
          return executeToolCall(tool, params, fallback.provider.id, ctx, failedProviders);
        }

        return result;
      } catch {
        recordProviderFailure(providerId, ctx.userId, ctx.tenantId);
        return {
          success: false,
          error: "Impossible de compléter l'action pour le moment.",
        };
      }
    },

    onApprovalRequired: (planId, stepId) => {
      listener?.("approval_required", { planId, stepId });
    },

    onStepCompleted: (planId, step) => {
      listener?.("step_completed", { planId, stepId: step.id, kind: step.kind });
    },

    onPlanCompleted: (completedPlan) => {
      listener?.("plan_completed", { planId: completedPlan.id });
    },

    onPlanDegraded: (degradedPlan, failedStep) => {
      listener?.("plan_failed", {
        planId: degradedPlan.id,
        status: degradedPlan.status,
        failedStep: failedStep.id,
      });
    },
  };

  // 3. Execute
  const executedPlan = await executePlan(plan.id, callbacks);
  const finalPlan = executedPlan ?? plan;

  // 4. Build focal object
  let focalObject: FocalObject | null = null;

  // If assets were produced, use the latest one
  if (producedAssets.length > 0) {
    const latest = producedAssets[producedAssets.length - 1];
    const tier = detectOutputTier(intent);
    const rawContent = (stepOutputs.values().next().value as Record<string, unknown> | undefined)?.content;
    const formatted = rawContent ? formatOutput(rawContent as string, tier) : undefined;
    focalObject = manifestAsset(latest, formatted);
  }

  // Otherwise derive from plan state
  if (!focalObject) {
    focalObject = manifestPlan(finalPlan);
  }

  // Record actions
  for (const step of finalPlan.steps) {
    if (step.status === "done" && step.kind === "deliver") {
      storeAction({
        id: `action_${Date.now()}`,
        threadId: ctx.threadId,
        type: "message_sent",
        provider: step.providerId ?? ("system" as ProviderId),
        status: "completed",
        timestamp: step.completedAt ?? Date.now(),
        metadata: { intent, tool: step.tool },
      });
    }
  }

  return { plan: finalPlan, focalObject, stepOutputs, assets: producedAssets };
}

// ── Approval resume ─────────────────────────────────────────

export async function approveAndResume(
  planId: string,
  ctx: PipelineContext,
  listener?: PipelineListener,
): Promise<PipelineResult> {
  const approved = approvePlan(planId);
  if (!approved) {
    return {
      plan: {
        id: planId,
        threadId: ctx.threadId,
        userId: ctx.userId,
        tenantId: ctx.tenantId,
        workspaceId: ctx.workspaceId ?? "default",
        intent: "",
        type: "one_shot",
        status: "failed",
        steps: [],
        requiresApproval: false,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      focalObject: null,
      stepOutputs: new Map(),
      assets: [],
    };
  }

  return executeIntent(approved.intent, ctx, listener);
}

// ── Tool execution router ───────────────────────────────────

async function executeToolCall(
  tool: string,
  params: Record<string, unknown>,
  providerId: ProviderId,
  ctx: PipelineContext,
  _failedProviders: ProviderId[],
): Promise<StepExecutionResult> {
  switch (tool) {
    case "send_message": {
      const result = await handleSendMessage({
        to: (params.to as string) ?? "",
        content: (params.content as string) ?? (params.intent as string) ?? "",
        providerId,
        channelRef: (params.channelRef as string) ?? "",
        threadId: ctx.threadId,
      });
      return {
        success: result.success,
        data: {
          messageId: result.messageId,
          deliveryStatus: result.deliveryStatus,
          channelRef: result.channelRef,
        },
        error: result.error,
      };
    }

    case "get_messages": {
      // TODO: call real Gmail/Slack API via provider tokens
      logPlanEvent("tool_stub", { tool, providerId });
      return {
        success: true,
        data: { content: `[Messages from ${providerId}] — stub data`, source: providerId },
      };
    }

    case "get_calendar_events": {
      // TODO: call real Google Calendar API
      logPlanEvent("tool_stub", { tool, providerId });
      return {
        success: true,
        data: { content: `[Calendar events from ${providerId}] — stub data`, source: providerId },
      };
    }

    case "get_files": {
      // TODO: call real Google Drive API
      logPlanEvent("tool_stub", { tool, providerId });
      return {
        success: true,
        data: { content: `[Files from ${providerId}] — stub data`, source: providerId },
      };
    }

    case "generate_report":
    case "generate_pdf":
    case "generate_xlsx": {
      // TODO: call real report generation
      logPlanEvent("tool_stub", { tool, providerId });
      return {
        success: true,
        data: { content: `[Generated ${tool}] — stub data` },
        assetId: `asset_${Date.now()}`,
      };
    }

    case "search_web": {
      // TODO: call real web search
      logPlanEvent("tool_stub", { tool, providerId });
      return {
        success: true,
        data: { content: `[Web search results] — stub data`, source: "web" },
      };
    }

    default: {
      logPlanEvent("tool_unknown", { tool, providerId });
      return {
        success: true,
        data: { content: `[${tool}] — completed`, source: providerId },
      };
    }
  }
}

// ── Asset creation helper ───────────────────────────────────

function createAssetFromOutput(
  threadId: string,
  title: string,
  tier: string,
  providerId: ProviderId,
  existingId?: string,
): Asset {
  const kind = tier === "report" ? "report" as const : tier === "brief" ? "brief" as const : "document" as const;
  return {
    id: existingId ?? `asset_${Date.now()}`,
    threadId,
    kind,
    title: title || (kind === "report" ? "Rapport" : "Synthèse"),
    outputTier: tier as Asset["outputTier"],
    provenance: { providerId },
    createdAt: Date.now(),
  };
}
