/**
 * Orchestrator — Public façade.
 *
 * Entry point for the v2 pipeline:
 * 1. Resolve CapabilityScope → ExecutionMode (capability-first router)
 * 2. Create RunEngine
 * 3. Dispatch to the appropriate handler based on mode
 * 4. Stream results via SSE
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { CreateRunInput } from "@/lib/engine/runtime/engine/types";
import { RunEngine } from "@/lib/engine/runtime/engine";
import { RunEventBus } from "@/lib/events/bus";
import { SSEAdapter } from "@/lib/events/consumers/sse-adapter";
import { LogPersister } from "@/lib/events/consumers/log-persister";
import { runAiPipeline } from "./ai-pipeline";
import { resolveExecutionMode, resolveCapabilityScope, scopeRequiresProviders, shouldInjectUserData, type ExecutionDecision } from "@/lib/capabilities/router";

import { createScheduledMission } from "@/lib/engine/runtime/missions/create-mission";
import { addMission } from "@/lib/engine/runtime/missions/store";
import { selectToolsForContext } from "@/lib/tools/tool-selector";
import { selectAgentForContext } from "@/lib/agents/agent-selector";
import type { RunRecord } from "@/lib/engine/runtime/runs/types";
import { addRun as storeRun } from "@/lib/engine/runtime/runs/store";
import { getTokens } from "@/lib/platform/auth/tokens";
import {
  saveRun as persistRun,
  updateRun as persistUpdateRun,
  saveScheduledMission as persistMission,
} from "@/lib/engine/runtime/state/adapter";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { assertTenantScope } from "@/lib/multi-tenant/guards";
import { SYSTEM_CONFIG } from "@/lib/system/config";
import { preflightConnector } from "@/lib/connectors/control-plane/preflight";
import { appendMessage, getRecentMessages } from "@/lib/memory/store";
import { memoryToConversationHistory } from "@/lib/memory/format";
import { isResearchIntent, isReportIntent } from "./research-intent";
import { runResearchReport } from "./run-research-report";
import { getRequiredProvidersForInput, getBlockedReasonForProviders } from "./provider-requirements";
import { shouldPersistEvent, persistRunEvent } from "@/lib/engine/runtime/timeline/persist";
import type { ProviderId } from "@/lib/providers/types";
import { retrieveUserDataContext } from "@/lib/connectors/data-retriever";

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
  /** Injected by runPipeline — formatted user data context for LLM */
  _userDataContext?: string;
  /** Injected by runPipeline — resolved capability domain */
  _capabilityDomain?: string;
  /** Injected by runPipeline — tools allowed for the current capability scope */
  _allowedTools?: string[];
  /** Injected by runPipeline — resolved retrieval mode from capability scope */
  _retrievalMode?: string | null;
  /** Caller opt-out for user-data injection (cron missions, tests). */
  skipUserData?: boolean;
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

async function resolveHasGoogle(userId: string): Promise<boolean> {
  try {
    const tokens = await getTokens(userId, "google");
    return Boolean(tokens?.accessToken);
  } catch {
    return false;
  }
}

// ── Mode handlers ────────────────────────────────────────────

async function handleDirectAnswer(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: OrchestrateInput,
  _scope: TenantScope,
): Promise<void> {
  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "AI pipeline: direct response…",
  });

  await runAiPipeline(engine, eventBus, {
    userId: input.userId,
    message: input.message,
    userDataContext: input._userDataContext,
    conversationHistory: input.conversationHistory,
    hasGoogle: await resolveHasGoogle(input.userId),
    surface: input.surface,
  });
}



async function handlePlanAndExecute(
  engine: RunEngine,
  input: OrchestrateInput,
  scope: TenantScope,
): Promise<void> {
  // If a retrieval mode is set, the request needs real provider data (Google
  // Drive/Gmail/Calendar). Route through the synthetic retrieval path which
  // fetches live data and then synthesises it.
  if (input._retrievalMode) {
    engine.events.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Retrieval mode: ${input._retrievalMode} — using provider data path`,
    });
    await runSyntheticRetrieval(engine, input, scope, input._retrievalMode);
    return;
  }

  // All other workflow/action requests go through the AI pipeline which
  // uses streamText with real Composio tool callbacks.
  engine.events.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "AI pipeline: agentic execution…",
  });

  await runAiPipeline(engine, engine.events, {
    userId: input.userId,
    message: input.message,
    userDataContext: input._userDataContext,
    conversationHistory: input.conversationHistory,
    hasGoogle: await resolveHasGoogle(input.userId),
    surface: input.surface,
  });
}


async function runSyntheticRetrieval(
  engine: RunEngine,
  input: OrchestrateInput,
  scope: TenantScope,
  retrievalMode: string,
  llmFallbackText?: string,
): Promise<void> {
  const { delegate } = await import("@/lib/engine/runtime/delegate/api");
  const { detectOutputTier, formatOutput } = await import("@/lib/engine/runtime/formatting/pipeline");
  const { storeAsset, storeAction } = await import("@/lib/assets/types");

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
        ...(input._capabilityDomain ? { capability_domain: input._capabilityDomain } : {}),
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

  // ── 1. Capability-first routing ─────────────────────────────
  const capScope = resolveCapabilityScope(input.message, input.surface);
  const decision: ExecutionDecision = resolveExecutionMode(capScope, input.message, input.focalContext);

  const researchDetected = isResearchIntent(input.message);
  const reportDetected = isReportIntent(input.message);

  if (researchDetected && decision.mode === "direct_answer") {
    decision.mode = "workflow";
    decision.reason = "Research intent detected — promoted from DIRECT_ANSWER";
    decision.backend = "hearst_runtime";
    console.log("[ExecutionMode] Research override: direct_answer → workflow");
  }

  input._capabilityDomain = capScope.domain;
  input._allowedTools = capScope.allowedTools;
  input._retrievalMode = capScope.retrievalMode;
  console.log("[ExecutionMode]", decision.mode, decision.reason, `[domain: ${capScope.domain}]`);

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
        tool_context: capScope.toolContext,
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
  const toolContext = capScope.toolContext;
  const surfaceTools = selectToolsForContext(toolContext);

  eventBus.emit({
    type: "tool_surface",
    run_id: engine.id,
    context: toolContext,
    tools: surfaceTools,
  });

  // ── Select agent (CUSTOM_AGENT mode) ────────────────────────
  // Backend selection is gone — every path runs through the planner +
  // executor stack now (Composio handles per-user execution dispatch).
  if (decision.mode === "custom_agent") {
    const agent = selectAgentForContext(toolContext);
    if (agent) {
      decision.agentId = agent.id;
      decision.backend = "hearst_runtime";

      runRecord.agentId = agent.id;
      runRecord.backend = "hearst_runtime";

      void persistUpdateRun(engine.id, {
        agentId: agent.id,
        backend: "hearst_runtime",
        executionMode: decision.mode,
      });

      eventBus.emit({
        type: "agent_selected",
        run_id: engine.id,
        agent_id: agent.id,
        agent_name: agent.name,
        allowed_tools: agent.allowedTools,
        backend: "hearst_runtime",
        backend_reason: "Single planner+executor backend after legacy cleanup",
      });

      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Routing to agent: ${agent.name}`,
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
    if (!researchDetected && scopeRequiresProviders(capScope)) {
      const providerReq = getRequiredProvidersForInput(input.message);
      const providersToCheck = providerReq?.providers ?? capScope.providers;

      if (providersToCheck.length > 0) {
        const preflightResults = await Promise.all(
          providersToCheck.map((p) =>
            preflightConnector({ provider: p, scope, userId: input.userId }),
          ),
        );
        const anyConnected = preflightResults.some((r) => r.ok);

        if (!anyConnected) {
          const capability = providerReq?.capability ?? capScope.capabilities[0] ?? capScope.domain;
          const userMessage = providerReq?.userMessage ?? getBlockedReasonForProviders(providersToCheck);

          console.log(`[Orchestrator] Capability blocked: ${capability} — no provider connected`);

          eventBus.emit({
            type: "capability_blocked",
            run_id: engine.id,
            capability,
            requiredProviders: providersToCheck,
            message: userMessage,
          });

          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Blocked: ${capability} requires ${providersToCheck.join(" or ")}`,
          });

          eventBus.emit({
            type: "text_delta",
            run_id: engine.id,
            delta: userMessage,
          });

          await engine.fail(`Provider required: ${providersToCheck.join(" or ")}`);
          return;
        }
      }
    }

    // ── User data retrieval (calendar, gmail, drive) ───────────
    // Default-on for user-data-likely domains so vague-but-personal questions
    // ("résume ma journée", "qu'est-ce que j'ai aujourd'hui") still inject.
    if (!input.skipUserData && shouldInjectUserData(capScope, input.message)) {
      const userId = scope.userId ?? input.userId;
      let hasGoogle = false;
      try {
        const googleTokens = await getTokens(userId, "google");
        hasGoogle = !!googleTokens?.accessToken;
      } catch {
        hasGoogle = false;
      }

      if (hasGoogle) {
        try {
          const keywordHit =
            capScope.needsProviderData.calendar ||
            capScope.needsProviderData.gmail ||
            capScope.needsProviderData.drive;
          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Retrieving user data — domain=${capScope.domain}, keywordHit=${keywordHit}`,
          });

          const PROVIDER_TO_TOOL: Record<"calendar" | "gmail" | "drive", string> = {
            calendar: "google.calendar.list_today_events",
            gmail: "google.gmail.list_recent_messages",
            drive: "google.drive.list_recent_files",
          };

          const dataContext = await retrieveUserDataContext(userId, {
            start: (provider) => {
              eventBus.emit({
                type: "tool_call_started",
                run_id: engine.id,
                step_id: `data_retrieve_${provider}_${engine.id}`,
                tool: PROVIDER_TO_TOOL[provider],
                providerId: "google",
                providerLabel: "Google",
              });
            },
            end: (provider, ok) => {
              eventBus.emit({
                type: "tool_call_completed",
                run_id: engine.id,
                step_id: `data_retrieve_${provider}_${engine.id}`,
                tool: PROVIDER_TO_TOOL[provider],
                providerId: "google",
              });
              if (!ok) {
                eventBus.emit({
                  type: "orchestrator_log",
                  run_id: engine.id,
                  message: `Provider read failed for ${provider} — continuing without it`,
                });
              }
            },
          });
          input._userDataContext = dataContext.formattedForLLM;
          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Data retrieved — Calendar=${dataContext.hasCalendarAccess}, Gmail=${dataContext.hasGmailAccess}, Drive=${dataContext.hasDriveAccess}`,
          });
        } catch (err) {
          console.error("[Orchestrator] Failed to retrieve user data:", err);
        }
      } else {
        eventBus.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `User data injection skipped — Google not connected (domain=${capScope.domain})`,
        });
      }
    }

    // ── Deterministic research path (skip if user data retrieval needed) ──
    if (researchDetected && !capScope.retrievalMode) {
      const pathLabel = reportDetected ? "research + report" : "research";
      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `${pathLabel} intent detected — using deterministic research path`,
      });
      await runResearchReport({ message: input.message, engine, eventBus, scope, threadId: input.threadId });
      return;
    }

    // After the legacy backend cleanup, every execution mode runs through
    // the same plan-and-execute path. Custom/managed agent paths are fed
    // by the planner LLM that now sees Composio-discovered actions.
    switch (decision.mode) {
      case "direct_answer":
        await handleDirectAnswer(engine, eventBus, input, scope);
        break;
      case "tool_call":
      case "workflow":
      case "custom_agent":
      case "managed_agent":
        await handlePlanAndExecute(engine, input, scope);
        break;
    }
  } finally {
    storeAssistantMemory();
  }
}

// ── Unified Orchestrator Exports ─────────────────────────

// The orchestrator has been unified. All exports are now from this file.
// orchestrateV2 and orchestrate are now the same unified implementation.
