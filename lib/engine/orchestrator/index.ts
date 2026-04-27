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
import { resolveExecutionMode, resolveCapabilityScope, scopeRequiresProviders, shouldInjectUserData, type ExecutionDecision } from "@/lib/capabilities/router";

import { selectToolsForContext } from "@/lib/tools/tool-selector";
import { selectAgentForContext } from "@/lib/agents/agent-selector";
import type { RunRecord } from "@/lib/engine/runtime/runs/types";
import { addRun as storeRun } from "@/lib/engine/runtime/runs/store";
import { getTokens } from "@/lib/platform/auth/tokens";
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
import { isResearchIntent, isReportIntent } from "./research-intent";
import { isWriteIntent } from "./write-intent";
import { isScheduleIntent } from "./schedule-intent";
import { checkSafetyGate } from "./safety-gate";
import { runResearchReport } from "./run-research-report";
import { getRequiredProvidersForInput, getBlockedReasonForProviders } from "./provider-requirements";
import { shouldPersistEvent, persistRunEvent } from "@/lib/engine/runtime/timeline/persist";
import type { ProviderId } from "@/lib/providers/types";
import { retrieveUserDataContext } from "@/lib/connectors/data-retriever";
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
  eventBus.on((e) => globalRunBus.broadcast(e));
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

// ── Mode handler ─────────────────────────────────────────────
//
// Every execution mode (direct_answer, tool_call, workflow, custom_agent,
// managed_agent) flows through the same AI pipeline. The retrieval mode
// short-circuit fetches live Google data and synthesises it deterministically
// — the streamText path doesn't run in that case.

async function handleAiPipeline(
  engine: RunEngine,
  eventBus: RunEventBus,
  input: OrchestrateInput,
  scope: TenantScope,
): Promise<void> {
  if (input._retrievalMode) {
    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Retrieval mode: ${input._retrievalMode} — using provider data path`,
    });
    await runSyntheticRetrieval(engine, input, scope, input._retrievalMode);
    return;
  }

  eventBus.emit({
    type: "orchestrator_log",
    run_id: engine.id,
    message: "AI pipeline: agentic execution…",
  });

  await runAiPipeline(engine, eventBus, {
    userId: input.userId,
    message: input.message,
    userDataContext: input._userDataContext,
    conversationHistory: input.conversationHistory,
    hasGoogle: await resolveHasGoogle(input.userId),
    surface: input.surface,
    domain: input._capabilityDomain,
    tenantId: scope.tenantId,
    workspaceId: scope.workspaceId,
    conversationId: input.conversationId,
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
        // Quality gate: don't promote a refusal/short reply into a persistent
        // asset. The right panel was getting flooded with "Je ne peux pas…"
        // entries because every retrieval call unconditionally created one.
        // Heuristic: ≥ 400 chars AND doesn't open with a refusal stem.
        const trimmed = content.trim();
        const refusalStems = [
          "je ne peux pas", "je ne suis pas en mesure", "je n'ai pas",
          "je n'arrive pas", "désolé", "impossible de",
          "i can't", "i cannot", "i'm unable", "i don't", "sorry",
        ];
        const head = trimmed.toLowerCase().slice(0, 80);
        const looksLikeRefusal = refusalStems.some((s) => head.includes(s));
        const tooShortForAsset = trimmed.length < 400;

        if (looksLikeRefusal || tooShortForAsset) {
          // Surface the body inline as a regular text response, no asset.
          engine.events.emit({
            type: "orchestrator_log",
            run_id: engine.id,
            message: `Synthetic retrieval ${looksLikeRefusal ? "refused" : "short"} (${trimmed.length} chars) — skipping asset, streaming inline`,
          });
          engine.events.emit({ type: "text_delta", run_id: engine.id, delta: trimmed });
          await engine.complete();
          return;
        }

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

// ── Main pipeline ────────────────────────────────────────────
//
// Mission scheduling is handled by the `create_scheduled_mission` tool in the
// AI pipeline (preview + confirm). Schedule intent is detected pre-LLM in
// `runPipeline` so the model gets a forcing directive instead of doing a
// one-shot retrieval.

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
      const recentMemory = await getRecentMessages(input.conversationId, 10);
      // Exclude the message we just appended (last one)
      const prior = recentMemory.slice(0, -1);
      if (prior.length > 0) {
        input.conversationHistory = memoryToConversationHistory(prior);
      }
    }
  }

  // ── Pre-LLM signal injection ──────────────────────────────
  // Recurring intent detected → bypass user-data fetch (Gmail/Calendar/Drive
  // are irrelevant when the user wants to *schedule* an action, not run it
  // now), and inject a top-priority directive that forces the model to
  // call `create_scheduled_mission` preview.
  const scheduleDetected = isScheduleIntent(input.message);
  if (scheduleDetected) {
    input.skipUserData = true;
    input._userDataContext =
      "[DIRECTIVE PRIORITAIRE — SCHEDULE INTENT]\n" +
      "Le message utilisateur décrit une AUTOMATION RÉCURRENTE (par ex. " +
      "« tous les matins à 8h », « chaque vendredi à 17h »).\n" +
      "Tu DOIS appeler le tool `create_scheduled_mission` avec `_preview: true` " +
      "comme PREMIÈRE action — avant tout autre tool, avant toute synthèse.\n" +
      "Tu ne dois PAS exécuter la tâche maintenant en mode ponctuel. La " +
      "valeur attendue est la création de l'automation récurrente.\n" +
      "Déduis les paramètres directement depuis le message :\n" +
      "  - name : titre court de la mission\n" +
      "  - input : la consigne que la mission devra exécuter à chaque tick\n" +
      "  - schedule : expression cron 5 champs (minute heure jour mois jour-semaine)\n" +
      "  - label : récurrence en français lisible\n";
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

  // Three classes of intent skip the synthetic-retrieval short-circuit and
  // route through the AI pipeline so the model can call Composio tools and
  // run multi-step plans:
  //   - WRITE: "envoie un slack" → preview tool, not Gmail summary.
  //   - SCHEDULE: "tous les matins à 8h" → create_scheduled_mission preview.
  //   - MULTI-STEP: "résume … puis envoie …" → step 2 must be reachable.
  const writeIntent = isWriteIntent(input.message);
  const multiStepIntent =
    /\b(puis|ensuite|et\s+ensuite|et\s+puis|après\s+ça|then|after\s+that)\b/i.test(input.message);
  const bypassRetrieval = writeIntent || scheduleDetected || multiStepIntent;
  input._retrievalMode = bypassRetrieval ? null : capScope.retrievalMode;

  console.log(
    "[ExecutionMode]",
    decision.mode,
    decision.reason,
    `[domain: ${capScope.domain}, retrieval: ${input._retrievalMode ?? "none"}, write: ${writeIntent}, schedule: ${scheduleDetected}, multistep: ${multiStepIntent}]`,
  );

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

    // Every execution mode flows through the same AI pipeline. The retrieval
    // mode short-circuit (real Google data fetch) is handled inside.
    await handleAiPipeline(engine, eventBus, input, scope);
  } finally {
    storeAssistantMemory();
  }
}

// ── Unified Orchestrator Exports ─────────────────────────

// The orchestrator has been unified. All exports are now from this file.
// orchestrateV2 and orchestrate are now the same unified implementation.
