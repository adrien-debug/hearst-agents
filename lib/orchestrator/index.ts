/**
 * Orchestrator — Public façade.
 *
 * Entry point for the v2 pipeline:
 * 1. Build ExecutionContext → select ExecutionMode (pure router)
 * 2. Create RunEngine
 * 3. Dispatch to the appropriate handler based on mode
 * 4. Stream results via SSE
 *
 * Coexists with the legacy chat pipeline in /api/chat.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateRunInput } from "../runtime/engine/types";
import { RunEngine } from "../runtime/engine";
import { RunEventBus } from "../events/bus";
import { SSEAdapter } from "../events/consumers/sse-adapter";
import { LogPersister } from "../events/consumers/log-persister";
import { planFromIntent } from "./planner";
import { executePlan } from "./executor";
import { selectExecutionMode } from "./execution-mode-selector";
import {
  ExecutionMode,
  type ExecutionContext,
  type ExecutionDecision,
} from "./types/execution-mode";
import { createAsset } from "../runtime/assets/create-asset";
import { createScheduledMission } from "../runtime/missions/create-mission";
import { addMission } from "../runtime/missions/store";
import type { ToolContext } from "../tools/types";
import { selectToolsForContext } from "../tools/tool-selector";
import { selectAgentForContext } from "../agents/agent-selector";
import { selectAgentBackend } from "../agents/backend/selector";
import type { RunRecord } from "../runtime/runs/types";
import { addRun as storeRun } from "../runtime/runs/store";
import { runAnthropicManaged } from "../agents/backend/run-anthropic-managed";
import {
  saveRun as persistRun,
  updateRun as persistUpdateRun,
  saveScheduledMission as persistMission,
} from "../runtime/state/adapter";
import type { TenantScope } from "../multi-tenant/types";
import { assertTenantScope } from "../multi-tenant/guards";
import { SYSTEM_CONFIG } from "../system/config";
import { registerProviderUsage, markProviderDegraded } from "../connectors/control-plane/register";
import { preflightConnector } from "../connectors/control-plane/preflight";
import { appendMessage, getRecentMessages } from "../memory/store";
import { memoryToConversationHistory } from "../memory/format";
import { isResearchIntent, isReportIntent } from "./research-intent";
import { runResearchReport } from "./run-research-report";
import { getRequiredProvidersForInput } from "./provider-requirements";
import { shouldPersistEvent, persistRunEvent } from "../runtime/timeline/persist";
import type { ProviderId } from "../providers/types";

interface FocalContext {
  id: string;
  objectType: string;
  title: string;
  status: string;
}

interface OrchestrateInput {
  userId: string;
  message: string;
  conversationId?: string;
  threadId?: string;
  surface?: string;
  focalContext?: FocalContext;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Set when triggered by the scheduler for a scheduled mission. */
  missionId?: string;
  tenantId?: string;
  workspaceId?: string;
}

const DEV_TENANT_ID = "dev-tenant";
const DEV_WORKSPACE_ID = "dev-workspace";

function buildTenantScope(input: OrchestrateInput): TenantScope {
  const scope: TenantScope = {
    tenantId: input.tenantId || DEV_TENANT_ID,
    workspaceId: input.workspaceId || DEV_WORKSPACE_ID,
    userId: input.userId,
  };

  if (!input.tenantId || !input.workspaceId) {
    if (SYSTEM_CONFIG.requireTenantScopeForV2) {
      throw new Error("Missing tenant scope for v2 execution");
    }
    console.warn("[Orchestrator] Using dev tenant scope — configure tenantId/workspaceId for production");
  }

  assertTenantScope(scope);
  return scope;
}

/**
 * Full orchestration pipeline returning an SSE ReadableStream.
 */
export function orchestrate(
  db: SupabaseClient,
  input: OrchestrateInput,
): ReadableStream {
  const eventBus = new RunEventBus();
  const sse = new SSEAdapter(eventBus);
  const logPersister = new LogPersister(db);
  const cleanupLogs = logPersister.attach(eventBus);

  const stream = new ReadableStream({
    start(controller) {
      sse.pipe(controller);

      runPipeline(db, eventBus, sse, input)
        .catch((err) => {
          console.error("[Orchestrator] pipeline error:", err);
          sse.sendError(err);
        })
        .finally(() => {
          cleanupLogs();
          sse.close();
          eventBus.destroy();
        });
    },
  });

  return stream;
}

// ── Execution Context builder ────────────────────────────────

const AUTONOMOUS_PATTERNS = [
  "analyse", "analyser", "recherche", "scrape", "crawl",
  "surveille", "monitore", "scan",
];
const MEMORY_PATTERNS = ["souviens", "rappelle", "mémorise", "retiens"];
const PROVIDER_KEYWORDS: Record<string, string[]> = {
  messages: ["email", "message", "inbox", "slack", "mail", "courrier"],
  calendar: ["agenda", "réunion", "calendrier", "événement", "planning"],
  files: ["fichier", "document", "drive"],
};

function buildExecutionContext(message: string, surface?: string, focalContext?: FocalContext): ExecutionContext {
  const lower = message.toLowerCase();

  const needsAutonomy = AUTONOMOUS_PATTERNS.some((p) => lower.includes(p));
  const needsMemory = MEMORY_PATTERNS.some((p) => lower.includes(p));

  let providersNeeded = 0;
  for (const keywords of Object.values(PROVIDER_KEYWORDS)) {
    if (keywords.some((k) => lower.includes(k))) providersNeeded++;
  }

  const wordCount = message.split(/\s+/).filter(Boolean).length;
  let complexity = 1;
  if (providersNeeded > 0) complexity += 2;
  if (providersNeeded > 1) complexity += 1;
  if (needsAutonomy) complexity += 3;
  if (wordCount > 30) complexity += 1;
  if (surface && surface !== "home") complexity += 1;
  if (focalContext) complexity += 2;

  return {
    intent: lower.slice(0, 120),
    complexity,
    providersNeeded,
    needsAutonomy,
    needsMemory,
  };
}

// ── Mode handlers ────────────────────────────────────────────

async function handleDirectAnswer(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: OrchestrateInput,
  scope: TenantScope,
): Promise<void> {
  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "Generating direct response…",
  });

  const result = await planFromIntent(
    engine.getDb(),
    engine,
    input.message,
    input.conversationHistory ?? [],
    input.surface,
  );

  if (result.kind === "direct_response") {
    eventBus.emit({ type: "text_delta", run_id: engine.id, delta: result.text });
    await engine.complete();
    return;
  }

  if (result.kind === "error") {
    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Planner error: ${result.error}`,
    });
    await engine.fail(result.error);
    return;
  }

  // Planner produced a plan even though we expected direct — execute it
  if (result.kind === "plan") {
    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Plan created with ${result.plan.steps.length} step(s)`,
    });
    await runPlanExecution(engine, result.plan, scope, input.threadId);
  }
}

async function handlePlanAndExecute(
  engine: RunEngine,
  input: OrchestrateInput,
  scope: TenantScope,
): Promise<void> {
  engine.events.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "Planning execution…",
  });

  const planResult = await planFromIntent(
    engine.getDb(),
    engine,
    input.message,
    input.conversationHistory ?? [],
    input.surface,
  );

  switch (planResult.kind) {
    case "direct_response": {
      const retrieval = detectRetrievalMode(input.message);
      if (retrieval) {
        engine.events.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `Planner returned direct response but provider data needed — creating synthetic plan (${retrieval})`,
        });
        await runSyntheticRetrieval(engine, input, scope, retrieval, planResult.text);
        return;
      }
      engine.events.emit({ type: "text_delta", run_id: engine.id, delta: planResult.text });
      await engine.complete();
      return;
    }

    case "error":
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Planner error: ${planResult.error}`,
      });
      await engine.fail(planResult.error);
      return;

    case "plan":
      if (planResult.plan.steps.length === 0) {
        const retrieval = detectRetrievalMode(input.message);
        if (retrieval) {
          engine.events.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Plan has 0 steps but provider data needed — creating synthetic plan (${retrieval})`,
          });
          await runSyntheticRetrieval(engine, input, scope, retrieval);
          return;
        }
      }
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Plan created with ${planResult.plan.steps.length} step(s) — executing`,
      });
      await runPlanExecution(engine, planResult.plan, scope, input.threadId);
      return;
  }
}

function detectRetrievalMode(message: string): string | null {
  const lower = message.toLowerCase();
  const docKeywords = ["document", "fichier", "file", "drive", "doc", "rapport", "pdf", "spreadsheet", "slide"];
  const msgKeywords = ["email", "emails", "mail", "mails", "courrier", "inbox", "gmail", "message"];

  if (docKeywords.some((k) => lower.includes(k))) return "documents";
  if (msgKeywords.some((k) => lower.includes(k))) return "messages";
  return null;
}

async function runSyntheticRetrieval(
  engine: RunEngine,
  input: OrchestrateInput,
  scope: TenantScope,
  retrievalMode: string,
  llmFallbackText?: string,
): Promise<void> {
  const { delegate } = await import("../runtime/delegate/api");
  const { detectOutputTier, formatOutput } = await import("../runtime/formatting/pipeline");
  const { storeAsset, storeAction } = await import("../assets/types");

  engine.events.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `Executing synthetic retrieval: ${retrievalMode}`,
  });

  try {
    const result = await delegate(engine, {
      run_id: engine.id,
      agent: "KnowledgeRetriever",
      task: input.message,
      context: {
        intent: input.message,
        surface: input.surface ?? "chat",
        retrieval_mode: retrievalMode,
      },
      expected_output: "summary",
      retrieval_mode: retrievalMode,
    });

    if (result.status === "success") {
      const data = result.data as Record<string, unknown>;
      const content = (data.content as string) ?? "";
      const providerUsed = (data.providerUsed as string) ?? "unknown";

      if (content) {
        engine.events.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `Synthetic retrieval completed (${content.length} chars) — creating asset`,
        });

        const threadId = input.threadId ?? engine.id;

        // Action: document_read
        storeAction({
          id: `action_read_${engine.id}_${Date.now()}`,
          threadId,
          type: "document_read",
          provider: providerUsed as ProviderId,
          status: "completed",
          timestamp: Date.now(),
          metadata: {
            query: input.message.slice(0, 200),
            sourceChars: content.length,
            retrievalMode,
          },
        });

        const tier = detectOutputTier(input.message);
        const formatted = formatOutput(content, tier);
        const assetKind = tier === "report" ? "report" as const : "brief" as const;

        const assetId = `asset_${engine.id}_${Date.now()}`;
        const now = Date.now();

        const asset = {
          id: assetId,
          threadId,
          kind: assetKind,
          title: formatted.title || `Synthèse : ${input.message.slice(0, 50)}`,
          summary: formatted.summary,
          outputTier: tier,
          provenance: {
            providerId: providerUsed as ProviderId,
            sentAt: now,
          },
          createdAt: now,
          contentRef: content,
          runId: engine.id,
        };

        storeAsset(asset);

        // Action: brief_generated or report_generated
        // assetId only in metadata — FK write deferred to avoid race with async storeAsset
        storeAction({
          id: `action_gen_${engine.id}_${Date.now()}`,
          threadId,
          type: assetKind === "report" ? "report_generated" : "brief_generated",
          provider: providerUsed as ProviderId,
          status: "completed",
          timestamp: Date.now(),
          metadata: {
            assetId,
            wordCount: formatted.wordCount,
            sectionCount: formatted.sections.length,
            tier,
          },
        });

        engine.events.emit({
          type: "asset_generated",
          run_id: engine.id,
          asset_id: assetId,
          asset_type: "report" as const,
          name: asset.title,
        });

        const focalObject = {
          objectType: assetKind,
          id: `fo_${assetId}`,
          threadId: asset.threadId,
          title: asset.title,
          status: "delivered",
          createdAt: now,
          updatedAt: now,
          sourceAssetId: assetId,
          sourceProviderId: providerUsed,
          morphTarget: null,
          summary: formatted.summary,
          sections: formatted.sections,
          tier: assetKind,
          tone: formatted.tone,
          wordCount: formatted.wordCount,
        };

        engine.events.emit({
          type: "focal_object_ready",
          run_id: engine.id,
          focal_object: focalObject as Record<string, unknown>,
        });

        engine.events.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `Focal object created: ${assetKind} (${formatted.wordCount} words, provider: ${providerUsed})`,
        });
      }
      await engine.complete();
    } else {
      if (llmFallbackText) {
        engine.events.emit({ type: "text_delta", run_id: engine.id, delta: llmFallbackText });
      }
      await engine.complete();
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Orchestrator] Synthetic retrieval failed:", msg);
    if (llmFallbackText) {
      engine.events.emit({ type: "text_delta", run_id: engine.id, delta: llmFallbackText });
    }
    await engine.complete();
  }
}

async function handleManagedAgentExecution(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: OrchestrateInput,
  scope: TenantScope,
): Promise<void> {
  // ── Preflight managed agent provider ─────────────────────
  const preflight = await preflightConnector({ provider: "anthropic_managed", scope });
  if (!preflight.ok) {
    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Managed agent preflight failed: ${preflight.reason ?? preflight.status} — registering and proceeding`,
    });
    void registerProviderUsage({ provider: "anthropic_managed", scope });
  }

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "Delegating to Anthropic managed agent…",
  });

  const managedStepId = `managed-${engine.id}`;

  eventBus.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: managedStepId,
    title: "managed_agent_execution",
    agent: "anthropic_managed",
  });

  try {
    const result = await runAnthropicManaged({
      prompt: input.message,
      runId: engine.id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: scope.userId,
      onEvent: (evt) => {
        if (evt.type === "step" && evt.tool) {
          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `[managed] ${evt.status === "running" ? "⟳" : "✓"} ${evt.tool}`,
          });
        }
        if (evt.type === "message" && evt.content) {
          eventBus.emit({ type: "text_delta", run_id: engine.id, delta: evt.content });
        }
      },
    });

    eventBus.emit({
      type: "step_completed",
      run_id: engine.id,
      step_id: managedStepId,
      agent: "anthropic_managed",
    });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Managed agent response received (${result.steps.length} tool call(s))`,
    });

    if (result.text) {
      const asset = createAsset({
        type: "report",
        name: "Managed Agent Output",
        run_id: engine.id,
        tenantId: scope.tenantId,
        workspaceId: scope.workspaceId,
      });

      eventBus.emit({
        type: "asset_generated",
        run_id: engine.id,
        asset_id: asset.id,
        asset_type: asset.type,
        name: asset.name,
      });

      const now = Date.now();
      eventBus.emit({
        type: "focal_object_ready",
        run_id: engine.id,
        focal_object: {
          objectType: asset.type,
          id: `fo_${asset.id}`,
          threadId: input.threadId ?? engine.id,
          title: asset.name,
          status: "delivered",
          createdAt: now,
          updatedAt: now,
          sourceAssetId: asset.id,
          morphTarget: null,
          summary: "",
          sections: [],
          tier: asset.type,
          tone: "executive",
          wordCount: 0,
        },
      });

      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Asset created: ${asset.name} (${asset.type})`,
      });
    }

    void registerProviderUsage({ provider: "anthropic_managed", scope });
    await engine.complete();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    void markProviderDegraded({ provider: "anthropic_managed", scope, error: message });

    eventBus.emit({
      type: "step_failed",
      run_id: engine.id,
      step_id: managedStepId,
      error: message,
    });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Managed agent failed: ${message}`,
    });

    console.error("[Orchestrator] Managed agent error, falling back to hearst_runtime:", message);

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: "Falling back to hearst_runtime execution",
    });

    return handlePlanAndExecute(engine, input, scope);
  }
}

async function runPlanExecution(
  engine: RunEngine,
  plan: import("../plans/types").Plan,
  scope: TenantScope,
  threadId?: string,
): Promise<void> {
  const execResult = await executePlan(engine.getDb(), engine, plan);

  switch (execResult.status) {
    case "completed": {
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Execution completed (${execResult.completedSteps.length} step(s) done)`,
      });

      maybeEmitAsset(engine, plan, scope, threadId);

      await engine.complete();
      return;
    }
    case "suspended":
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Execution suspended — awaiting input`,
      });
      return;
    case "failed":
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Execution failed: ${execResult.error ?? "unknown"}`,
      });
      await engine.fail(execResult.error ?? "Plan execution failed");
      return;
  }
}

// ── Asset generation ─────────────────────────────────────────

const ASSET_STEP_THRESHOLD = 2;

function maybeEmitAsset(
  engine: RunEngine,
  plan: import("../plans/types").Plan,
  scope: TenantScope,
  threadId?: string,
): void {
  const hasDocBuilder = plan.steps.some((s) => s.agent === "DocBuilder");
  const isMultiStep = plan.steps.length >= ASSET_STEP_THRESHOLD;

  if (!hasDocBuilder && !isMultiStep) return;

  const assetType = hasDocBuilder ? "report" as const : "doc" as const;
  const label = plan.steps.find((s) => s.agent === "DocBuilder")?.intent
    ?? plan.steps[plan.steps.length - 1]?.intent
    ?? "Generated output";

  const asset = createAsset({
    type: assetType,
    name: label,
    run_id: engine.id,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
  });

  engine.events.emit({
    type: "asset_generated",
    run_id: engine.id,
    asset_id: asset.id,
    asset_type: asset.type,
    name: asset.name,
  });

  const now = Date.now();
  engine.events.emit({
    type: "focal_object_ready",
    run_id: engine.id,
    focal_object: {
      objectType: assetType,
      id: `fo_${asset.id}`,
      threadId: threadId ?? engine.id,
      title: asset.name,
      status: "delivered",
      createdAt: now,
      updatedAt: now,
      sourceAssetId: asset.id,
      morphTarget: null,
      summary: "",
      sections: [],
      tier: assetType,
      tone: "executive",
      wordCount: 0,
    },
  });

  engine.events.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: `Asset created: ${asset.name} (${asset.type})`,
  });
}

// ── Tool context inference ───────────────────────────────────

const CONTEXT_KEYWORDS: Array<{ context: ToolContext; keywords: string[] }> = [
  { context: "inbox", keywords: ["email", "message", "mail", "inbox", "slack", "courrier"] },
  { context: "calendar", keywords: ["agenda", "réunion", "calendrier", "événement", "planning"] },
  { context: "files", keywords: ["fichier", "document", "drive"] },
  { context: "finance", keywords: ["crypto", "bitcoin", "revenue", "marché", "portfolio", "finance", "prix", "trading"] },
  { context: "research", keywords: ["recherche", "analyse", "étude", "compare", "investigate"] },
];

function inferToolContext(message: string, surface?: string): ToolContext {
  if (surface && surface !== "home") {
    const mapped = surface as ToolContext;
    if (["inbox", "calendar", "files"].includes(mapped)) return mapped;
  }

  const lower = message.toLowerCase();
  for (const { context, keywords } of CONTEXT_KEYWORDS) {
    if (keywords.some((k) => lower.includes(k))) return context;
  }

  return "general";
}

// ── Schedule detection ───────────────────────────────────────

const SCHEDULE_PATTERNS: Array<{ pattern: RegExp; schedule: string; label: string }> = [
  { pattern: /tous les matins|every\s+morning|chaque matin/, schedule: "0 8 * * *", label: "Tous les jours à 8h" },
  { pattern: /tous les soirs|every\s+evening|chaque soir/, schedule: "0 18 * * *", label: "Tous les jours à 18h" },
  { pattern: /every\s+day|tous les jours|chaque jour|daily/, schedule: "0 8 * * *", label: "Tous les jours à 8h" },
  { pattern: /à\s+(\d{1,2})h/, schedule: "", label: "" },
];

function detectSchedule(message: string): { schedule: string; label: string } | null {
  const lower = message.toLowerCase();

  for (const p of SCHEDULE_PATTERNS) {
    if (!p.schedule) {
      const match = lower.match(p.pattern);
      if (match) {
        const hour = parseInt(match[1], 10);
        if (hour >= 0 && hour <= 23) {
          return { schedule: `0 ${hour} * * *`, label: `Tous les jours à ${hour}h` };
        }
      }
      continue;
    }
    if (p.pattern.test(lower)) {
      return { schedule: p.schedule, label: p.label };
    }
  }
  return null;
}

// ── Main pipeline ────────────────────────────────────────────

async function runPipeline(
  db: SupabaseClient,
  eventBus: RunEventBus,
  _sse: SSEAdapter,
  input: OrchestrateInput,
): Promise<void> {
  const scope = buildTenantScope(input);

  // ── Memory: resolve conversationId from threadId if absent ──
  if (!input.conversationId && input.threadId) {
    input.conversationId = input.threadId;
  }

  // ── Memory: load conversation context ──────────────────────
  if (input.conversationId) {
    appendMessage(input.conversationId, {
      role: "user",
      content: input.message,
      createdAt: Date.now(),
    }, scope);

    if (!input.conversationHistory || input.conversationHistory.length === 0) {
      const recentMemory = getRecentMessages(input.conversationId, 10);
      // Exclude the message we just appended (last one)
      const prior = recentMemory.slice(0, -1);
      if (prior.length > 0) {
        input.conversationHistory = memoryToConversationHistory(prior);
      }
    }
  }

  // ── 0. Schedule detection (early exit) ─────────────────────
  const scheduleMatch = detectSchedule(input.message);
  if (scheduleMatch && !input.missionId) {
    const mission = createScheduledMission({
      name: input.message.slice(0, 80),
      input: input.message,
      schedule: scheduleMatch.schedule,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: input.userId,
    });
    addMission(mission);

    void persistMission({
      id: mission.id,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      userId: mission.userId,
      name: mission.name,
      input: mission.input,
      schedule: mission.schedule,
      enabled: mission.enabled,
      createdAt: mission.createdAt,
    });

    const placeholderRunId = `schedule-${mission.id}`;

    eventBus.emit({
      type: "scheduled_mission_created",
      run_id: placeholderRunId,
      mission_id: mission.id,
      name: mission.name,
      schedule: scheduleMatch.schedule,
    });

    eventBus.emit({
      type: "text_delta",
      run_id: placeholderRunId,
      delta: `Mission planifiée : "${mission.name}"\nRécurrence : ${scheduleMatch.label}\nElle s'exécutera automatiquement.`,
    });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: placeholderRunId,
      message: `Scheduled mission created: ${mission.name} (${scheduleMatch.schedule})`,
    });

    console.log(`[Orchestrator] Scheduled mission created: ${mission.id} — ${scheduleMatch.schedule}`);
    return;
  }

  // ── 1. Route: build context → select execution mode ────────
  const ctx = buildExecutionContext(input.message, input.surface, input.focalContext);
  const decision: ExecutionDecision = selectExecutionMode(ctx);

  // ── Research intent override ──────────────────────────────
  const researchDetected = isResearchIntent(input.message);
  const reportDetected = isReportIntent(input.message);

  if (researchDetected && decision.mode === ExecutionMode.DIRECT_ANSWER) {
    decision.mode = ExecutionMode.WORKFLOW;
    decision.reason = "Research intent detected — promoted from DIRECT_ANSWER";
    decision.backend = "hearst_runtime";
    console.log("[ExecutionMode] Research override: DIRECT_ANSWER → WORKFLOW");
  }

  console.log("[ExecutionMode]", decision.mode, decision.reason);

  // ── 2. Create Run ──────────────────────────────────────────
  const createInput: CreateRunInput = {
    user_id: input.userId,
    conversation_id: input.conversationId ?? null,
    entrypoint: input.missionId ? "webhook" : "chat",
    request: {
      message: input.message,
      surface: input.surface,
      context: {
        execution_mode: decision.mode,
        tool_context: inferToolContext(input.message, input.surface),
        ...(decision.agentId ? { agent_id: decision.agentId } : {}),
        ...(decision.backend ? { agent_backend: decision.backend } : {}),
        ...(input.missionId ? { mission_id: input.missionId } : {}),
        ...(input.focalContext ? { focal_context: input.focalContext } : {}),
      },
    },
  };

  const engine = await RunEngine.create(db, createInput, eventBus);
  await engine.start();

  // ── Init RunRecord for history ─────────────────────────────
  const runRecord: RunRecord = {
    id: engine.id,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    userId: input.userId,
    input: input.message,
    surface: input.surface,
    executionMode: decision.mode,
    missionId: input.missionId,
    createdAt: Date.now(),
    status: "running",
    events: [],
    assets: [],
  };
  storeRun(runRecord);

  // Persist to Supabase (fire-and-forget)
  void persistRun({
    id: engine.id,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    userId: input.userId,
    input: input.message,
    surface: input.surface,
    executionMode: decision.mode,
    missionId: input.missionId,
    status: "running",
    createdAt: Date.now(),
    assets: [],
  });

  // Cleanup handled by eventBus.destroy() in orchestrate()
  void eventBus.on((event) => {
    if (event.run_id !== engine.id) return;
    runRecord.events.push(event);

    // Durable timeline persistence (fire-and-forget)
    if (shouldPersistEvent(event.type)) {
      void persistRunEvent({
        runId: engine.id,
        type: event.type,
        ts: new Date(event.timestamp).getTime(),
        payload: event as unknown as Record<string, unknown>,
      });
    }

    if (event.type === "asset_generated") {
      const ev = event as unknown as Record<string, unknown>;
      runRecord.assets.push({
        id: event.asset_id,
        name: event.name,
        type: event.asset_type,
        ...(ev.filePath ? {
          _filePath: ev.filePath as string,
          _fileName: ev.fileName as string,
          _mimeType: ev.mimeType as string,
          _sizeBytes: ev.sizeBytes as number,
        } : {}),
      });
    }
    if (event.type === "run_completed") {
      runRecord.status = "completed";
      runRecord.completedAt = Date.now();
      void persistUpdateRun(engine.id, {
        status: "completed",
        completedAt: runRecord.completedAt,
        assets: runRecord.assets,
      });
    }
    if (event.type === "run_failed") {
      runRecord.status = "failed";
      runRecord.completedAt = Date.now();
      void persistUpdateRun(engine.id, {
        status: "failed",
        completedAt: runRecord.completedAt,
      });
    }
  });

  // ── Emit tool surface (first event for UI) ─────────────────
  const toolContext = inferToolContext(input.message, input.surface);
  const surfaceTools = selectToolsForContext(toolContext);

  eventBus.emit({
    type: "tool_surface",
    run_id: engine.id,
    context: toolContext,
    tools: surfaceTools,
  });

  // ── Select agent + backend (CUSTOM_AGENT mode) ──────────────
  if (decision.mode === ExecutionMode.CUSTOM_AGENT) {
    const agent = selectAgentForContext(toolContext);
    if (agent) {
      const backendDecision = selectAgentBackend({
        agent,
        context: toolContext,
        userInput: input.message,
        complexity: ctx.complexity,
        needsAutonomy: ctx.needsAutonomy,
      });

      decision.agentId = agent.id;
      decision.backend = backendDecision.backend;

      runRecord.agentId = agent.id;
      runRecord.backend = backendDecision.backend;

      void persistUpdateRun(engine.id, {
        agentId: agent.id,
        backend: backendDecision.backend,
        executionMode: decision.mode,
      });

      eventBus.emit({
        type: "agent_selected",
        run_id: engine.id,
        agent_id: agent.id,
        agent_name: agent.name,
        allowed_tools: agent.allowedTools,
        backend: backendDecision.backend,
        backend_reason: backendDecision.reason,
      });

      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Routing to agent: ${agent.name} via ${backendDecision.backend}`,
      });
    }
  }

  // ── Emit mission triggered (if scheduler) ──────────────────
  if (input.missionId) {
    eventBus.emit({
      type: "scheduled_mission_triggered",
      run_id: engine.id,
      mission_id: input.missionId,
      name: input.message.slice(0, 80),
    });
  }

  // ── Emit execution mode to SSE ─────────────────────────────
  eventBus.emit({
    type: "execution_mode_selected",
    run_id: engine.id,
    mode: decision.mode,
    reason: decision.reason,
    backend: decision.backend,
  });

  // ── 3. Capture assistant output for memory ─────────────────
  let assistantOutput = "";
  const unsubscribe = eventBus.on((event) => {
    if (event.type === "text_delta") {
      assistantOutput += event.delta;
    }
  });

  const storeAssistantMemory = () => {
    unsubscribe();
    if (input.conversationId && assistantOutput.length > 0) {
      appendMessage(input.conversationId, {
        role: "assistant",
        content: assistantOutput,
        createdAt: Date.now(),
      }, scope);
    }
  };

  // ── 4. Dispatch by execution mode ──────────────────────────
  try {
    // ── Provider preflight (skip for research — uses web, not user providers) ──
    if (!researchDetected) {
      const providerReq = getRequiredProvidersForInput(input.message);
      if (providerReq) {
        const preflightResults = await Promise.all(
          providerReq.providers.map((p) =>
            preflightConnector({ provider: p, scope, userId: input.userId }),
          ),
        );
        const anyConnected = preflightResults.some((r) => r.ok);

        if (!anyConnected) {
          console.log(`[Orchestrator] Capability blocked: ${providerReq.capability} — no provider connected`);

          eventBus.emit({
            type: "capability_blocked",
            run_id: engine.id,
            capability: providerReq.capability,
            requiredProviders: providerReq.providers,
            message: providerReq.userMessage,
          });

          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Blocked: ${providerReq.capability} requires ${providerReq.providers.join(" or ")}`,
          });

          eventBus.emit({
            type: "text_delta",
            run_id: engine.id,
            delta: providerReq.userMessage,
          });

          await engine.fail(`Provider required: ${providerReq.providers.join(" or ")}`);
          return;
        }
      }
    }

    // ── Deterministic research path (skip if user data retrieval needed) ──
    const userDataRetrieval = detectRetrievalMode(input.message);
    if (researchDetected && !userDataRetrieval) {
      const pathLabel = reportDetected ? "research + report" : "research";
      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `${pathLabel} intent detected — using deterministic research path`,
      });
      await runResearchReport({ message: input.message, engine, eventBus, scope, threadId: input.threadId });
      return;
    }

    switch (decision.mode) {
      case ExecutionMode.DIRECT_ANSWER:
        await handleDirectAnswer(engine, eventBus, input, scope);
        break;
      case ExecutionMode.TOOL_CALL:
      case ExecutionMode.WORKFLOW:
        await handlePlanAndExecute(engine, input, scope);
        break;
      case ExecutionMode.CUSTOM_AGENT:
        if (decision.backend === "anthropic_managed") {
          await handleManagedAgentExecution(engine, eventBus, input, scope);
        } else {
          await handlePlanAndExecute(engine, input, scope);
        }
        break;
      case ExecutionMode.MANAGED_AGENT:
        await handleManagedAgentExecution(engine, eventBus, input, scope);
        break;
    }
  } finally {
    storeAssistantMemory();
  }
}
