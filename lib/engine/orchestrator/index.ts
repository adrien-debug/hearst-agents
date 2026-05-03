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
import { globalRunBus } from "@/lib/events/global-bus";
import { runAiPipeline } from "./ai-pipeline";
import { runPlannerWorkflow, isComplexIntent, isPlannerEnabled } from "./run-planner-workflow";
import { registerRun, unregisterRun } from "./abort-registry";
import { resolveExecutionMode, resolveCapabilityScope, scopeRequiresProviders, type ExecutionDecision } from "@/lib/capabilities/router";

import { selectAgentForContext } from "@/lib/agents/agent-selector";
import type { RunRecord } from "@/lib/engine/runtime/runs/types";
import { addRun as storeRun } from "@/lib/engine/runtime/runs/store";
import {
  saveRun as persistRun,
  updateRun as persistUpdateRun,
} from "@/lib/engine/runtime/state/adapter";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { assertTenantScope } from "@/lib/multi-tenant/guards";
import { SYSTEM_CONFIG } from "@/lib/system/config";
import { preflightConnector } from "@/lib/connectors/control-plane/preflight";
import { appendMessage, getRecentMessages } from "@/lib/memory/store";
import { memoryToConversationHistory } from "@/lib/memory/format";
import { appendToSummary } from "@/lib/memory/conversation-summary";
import { isResearchIntent, isReportIntent } from "./research-intent";
import { isScheduleIntent } from "./schedule-intent";
import { checkSafetyGate } from "./safety-gate";
import { runResearchReport } from "./run-research-report";
import { getRequiredProvidersForInput, getBlockedReasonForProviders } from "./provider-requirements";
import { shouldPersistEvent, persistRunEvent } from "@/lib/engine/runtime/timeline/persist";
import { isFeatureEnabled } from "@/lib/admin/settings";

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
  /** B4 — assets droppés dans ChatInput. Le pipeline IA les injecte dans le user message. */
  attachedAssetIds?: string[];
  /** C4 — persona explicite (override per-thread / par message). */
  personaId?: string;
  /** Set when triggered by the scheduler for a scheduled mission. */
  missionId?: string;
  /**
   * Mission Memory (vague 9) — bloc XML <mission_context>…</mission_context>
   * pré-formaté à injecter dans le system prompt cacheable. Contient le
   * `contextSummary` mission + N derniers `mission_messages`. Calculé en
   * amont (route /missions/[id]/run) via `formatMissionContextBlock` pour
   * éviter de coupler l'orchestrator à Supabase.
   */
  missionContext?: string;
  tenantId?: string;
  workspaceId?: string;
  /** Injected by runPipeline — resolved capability domain */
  _capabilityDomain?: string;
  /** Injected by runPipeline — tools allowed for the current capability scope */
  _allowedTools?: string[];
  /** Injected by runPipeline — recurring intent detected, force schedule preview. */
  _scheduleDirective?: boolean;
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
  eventBus.on((e) => globalRunBus.broadcast(e));
  const sse = new SSEAdapter(eventBus);
  const logPersister = new LogPersister(db);
  const cleanupLogs = logPersister.attach(eventBus);

  const stream = new ReadableStream({
    start(controller) {
      sse.pipe(controller);
      // Keep-alive : envoie un commentaire SSE toutes les 20s pour que les
      // proxies (Cloudflare, Vercel, nginx) ne ferment pas la connexion sur
      // les runs longs (research, browser, video gen, meeting bot).
      sse.startHeartbeat(20_000);

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

// ── Mode handler ─────────────────────────────────────────────
//
// Every execution mode (direct_answer, tool_call, workflow, custom_agent,
// managed_agent) flows through the same AI pipeline. Reading user data
// (Gmail, Calendar, Drive, Slack, Notion…) is the model's job: it calls the
// relevant Composio tool when it actually needs the data. There is no
// orchestrator-level pre-fetch.

async function handleAiPipeline(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: OrchestrateInput,
  scope: TenantScope,
  abortSignal?: AbortSignal,
): Promise<void> {
  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "AI pipeline: agentic execution…",
  });

  await runAiPipeline(engine, eventBus, {
    userId: input.userId,
    message: input.message,
    conversationHistory: input.conversationHistory,
    surface: input.surface,
    domain: input._capabilityDomain,
    scheduleDirective: input._scheduleDirective ?? false,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    conversationId: input.conversationId,
    threadId: input.threadId,
    attachedAssetIds: input.attachedAssetIds,
    personaId: input.personaId,
    missionContext: input.missionContext,
    abortSignal,
  });
}


// ── Main pipeline ────────────────────────────────────────────
//
// Mission scheduling is handled by the `create_scheduled_mission` tool in the
// AI pipeline (preview + confirm). Schedule intent is detected pre-LLM in
// `runPipeline` so the prompt receives a forcing directive at build time.

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
    // Await la WAL durable côté store : garantit que le message user est
    // récupérable depuis Redis même si le process meurt avant le persist
    // Supabase. Coût ~5ms — négligeable face au LLM call qui suit.
    await appendMessage(input.conversationId, {
      role: "user",
      content: input.message,
      createdAt: Date.now(),
    }, scope);
    void appendToSummary({ userId: input.userId, role: "user", content: input.message });

    if (!input.conversationHistory || input.conversationHistory.length === 0) {
      const recentMemory = await getRecentMessages(input.conversationId, 10);
      // Exclude the message we just appended (last one)
      const prior = recentMemory.slice(0, -1);
      if (prior.length > 0) {
        input.conversationHistory = memoryToConversationHistory(prior);
      }
    }
  }

  // ── Pre-LLM signal injection ──────────────────────────────
  // Schedule intent is detected here so `buildAgentSystemPrompt` can
  // prepend a forcing directive — without it the model treats a recurring
  // request ("tous les matins à 8h") as a one-shot.
  const scheduleDetected = isScheduleIntent(input.message);
  input._scheduleDirective = scheduleDetected;

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

  console.log(
    "[ExecutionMode]",
    decision.mode,
    decision.reason,
    `[domain: ${capScope.domain}, schedule: ${scheduleDetected}]`,
  );

  // ── 2. Create Run ──────────────────────────────────────────
  const createInput: CreateRunInput = {
    user_id: input.userId,
    tenant_id: scope.tenantId,
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

  // ── Abort plumbing : enregistre un AbortController dans le registry
  // global pour que POST /api/orchestrate/abort/[runId] puisse vraiment
  // couper le run (et pas seulement la connexion SSE côté client).
  const abortController = new AbortController();
  registerRun(engine.id, abortController);

  // ── Safety gate (BEFORE any tool exposure) ─────────────────
  // Hostile / abusive intents are refused here so we never propose a tool
  // call (and never trigger an OAuth card for an action that should never
  // happen). The model is also bypassed — pure cost saving + zero risk of
  // jailbreak from this point on.
  // Toggleable via the `safety_gate_enabled` feature flag (default: true) so
  // operators can flip it from the admin canvas for debug or red-team runs.
  const safetyEnabled = await isFeatureEnabled(db, "safety_gate_enabled", scope.tenantId, true);
  const safety = safetyEnabled ? checkSafetyGate(input.message) : { kind: "ok" as const };
  if (safety.kind !== "ok") {
    console.log(`[Orchestrator] Safety gate ${safety.kind}: ${safety.reason}`);
    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Safety gate ${safety.kind}: ${safety.reason}`,
    });
    eventBus.emit({
      type: "text_delta",
      run_id: engine.id,
      delta: safety.userMessage,
    });
    await engine.complete();
    return;
  }

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

  // ── Emit tool surface (signal de transition d'état pour admin canvas) ─
  // Le contenu `tools` n'est plus consommé par l'UI principale (la palette
  // n'a jamais été implémentée côté user). On garde l'event pour les
  // transitions du graphe admin (intent → preflight → tools active) — il
  // suffit que l'event soit émis, son tableau peut rester vide.
  const toolContext = capScope.toolContext;
  eventBus.emit({
    type: "tool_surface",
    run_id: engine.id,
    context: toolContext,
    tools: [],
  });

  // ── Select agent (CUSTOM_AGENT mode) ────────────────────────
  // All execution modes flow through the same AI pipeline (streamText with
  // Composio tools). The agent record here is informational only — it
  // surfaces "which agent" the UI should display in the right panel.
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
        backend_reason: "AI pipeline (streamText + Composio)",
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

  const storeAssistantMemory = async (): Promise<void> => {
    unsubscribe();
    if (input.conversationId && assistantOutput.length > 0) {
      // Await la WAL durable (~5ms Redis) avant de rendre la main : le
      // message assistant doit survivre au teardown du process serverless.
      await appendMessage(input.conversationId, {
        role: "assistant",
        content: assistantOutput,
        createdAt: Date.now(),
      }, scope);
      void appendToSummary({ userId: input.userId, role: "assistant", content: assistantOutput });
    }
  };

  // ── 4. Dispatch by execution mode ──────────────────────────
  try {
    // ── Provider preflight (skip for research — uses web, not user providers) ──
    //
    // The previous behaviour was to `engine.fail()` with an English message
    // ("X is not connected") whenever no provider was connected. That broke
    // dozens of trivial prompts — the routing keyword fix (F1) eliminates
    // most false positives, but even legitimately-blocked prompts deserve a
    // graceful path:
    //   - if the user *explicitly* mentioned the app (request from
    //     `getRequiredProvidersForInput` keyword match), surface
    //     `app_connect_required` and let the inline OAuth card take over.
    //   - if the routing only inferred the provider (no explicit mention),
    //     fall through to the AI pipeline so the model can clarify or
    //     answer without the missing provider.
    if (!researchDetected && scopeRequiresProviders(capScope)) {
      const providerReq = getRequiredProvidersForInput(input.message);
      const userExplicitlyMentioned = providerReq !== null;
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
          console.log(
            `[Orchestrator] Provider absent: ${capability} (explicit=${userExplicitlyMentioned}) — providers=${providersToCheck.join(",")}`,
          );

          if (userExplicitlyMentioned) {
            // The user named the app — surface the OAuth card via the canonical
            // event the AI pipeline already uses, so the UI shows
            // `ChatConnectInline` instead of a hard run failure.
            const userMessage =
              providerReq?.userMessage ??
              getBlockedReasonForProviders(providersToCheck);

            for (const app of providersToCheck) {
              eventBus.emit({
                type: "app_connect_required",
                run_id: engine.id,
                app,
                reason: userMessage,
              });
            }

            eventBus.emit({
              type: "orchestrator_log",
              run_id: engine.id,
              message: `Provider needed: ${capability} → ${providersToCheck.join(", ")}`,
            });

            eventBus.emit({
              type: "text_delta",
              run_id: engine.id,
              delta: userMessage,
            });

            // Successful, controlled completion — not a failure.
            await engine.complete();
            return;
          }

          // Inferred (false-positive) routing: drop the preflight and let the
          // AI pipeline run normally. The model can still clarify or fall back
          // to general chat.
          eventBus.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Routing inferred ${capability} but user didn't mention it — falling through to AI pipeline`,
          });
        }
      }
    }

    // ── Reasoning path — DeepSeek R1 ───────────────────────────
    if (capScope.intent === "reasoning") {
      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: "Routing to DeepSeek R1 (reasoning intent detected)",
      });

      const { deepseekChat } = await import("@/lib/capabilities/providers/deepseek");
      const messages: Array<{ role: "user" | "assistant" | "system"; content: string }> = [
        ...(input.conversationHistory ?? []),
        { role: "user", content: input.message },
      ];

      const result = await deepseekChat({ messages, maxTokens: 8192 });

      if (result.reasoningContent) {
        eventBus.emit({
          type: "text_delta",
          run_id: engine.id,
          delta: `<think>${result.reasoningContent}</think>\n\n`,
        });
      }
      eventBus.emit({ type: "text_delta", run_id: engine.id, delta: result.content });
      await engine.complete();
      return;
    }

    // ── Deterministic research path ────────────────────────────
    // Research / report intents (« cherche … », « rapport sur … ») use a
    // deterministic web-search pipeline rather than streamText. Everything
    // else routes to the AI pipeline below.
    //
    // EXCEPTION : si l'intent est aussi récurrent (« tous les matins, fais
    // un rapport sur X »), on N'IGNORE PAS la planification. Le research
    // path est one-shot et ne connaît pas `create_scheduled_mission` —
    // route vers ai-pipeline qui voit la scheduleDirective et appelle le
    // bon tool. La mission elle-même appellera ensuite get_stock_quotes /
    // get_crypto_prices / web_search au moment du tick.
    if (researchDetected && !scheduleDetected) {
      const pathLabel = reportDetected ? "research + report" : "research";
      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `${pathLabel} intent detected — using deterministic research path`,
      });
      await runResearchReport({ message: input.message, engine, eventBus, scope, threadId: input.threadId });
      return;
    }

    // ── Mission Control planner (B1) ─────────────────────────
    // Si l'intention est complexe ET le feature flag est ON, on route vers
    // le planner multi-step (preview → execution step-by-step). Fail-soft :
    // tout crash retombe sur runAiPipeline, jamais bloquant pour le user.
    if (isPlannerEnabled() && isComplexIntent(input.message)) {
      eventBus.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: "Complex intent detected — routing to planner workflow",
      });
      try {
        await runPlannerWorkflow(engine, eventBus, {
          userId: input.userId,
          tenantId: scope.tenantId,
          workspaceId: scope.workspaceId,
          threadId: input.threadId ?? input.conversationId ?? engine.id,
          message: input.message,
        });
        await engine.complete();
        return;
      } catch (err) {
        console.error("[Orchestrator] planner crash — fallback to AI pipeline:", err);
        eventBus.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `Planner failed (${err instanceof Error ? err.message : "unknown"}) — fallback to AI pipeline`,
        });
        // Fall through to handleAiPipeline below
      }
    }

    // Every other execution mode flows through the same AI pipeline. The
    // model decides which provider tools to call (Gmail, Calendar, Slack…)
    // — there is no orchestrator-level pre-fetch of user data.
    await handleAiPipeline(engine, eventBus, input, scope, abortController.signal);
  } finally {
    if (abortController.signal.aborted) {
      eventBus.emit({
        type: "run_aborted",
        run_id: engine.id,
        reason: "client_requested",
      });
    }
    unregisterRun(engine.id);
    await storeAssistantMemory();
  }
}

// ── Unified Orchestrator Exports ─────────────────────────

// The orchestrator has been unified. All exports are now from this file.
// orchestrateV2 and orchestrate are now the same unified implementation.
