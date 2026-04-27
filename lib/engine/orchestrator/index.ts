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
import { planFromIntent } from "./planner";
import { executePlan } from "./executor";
import { resolveExecutionMode, resolveCapabilityScope, scopeRequiresProviders, shouldInjectUserData, type ExecutionDecision } from "@/lib/capabilities/router";
import { createAsset } from "@/lib/engine/runtime/assets/create-asset";
import { createScheduledMission } from "@/lib/engine/runtime/missions/create-mission";
import { addMission } from "@/lib/engine/runtime/missions/store";
import { selectToolsForContext } from "@/lib/tools/tool-selector";
import { selectAgentForContext } from "@/lib/agents/agent-selector";
import { selectAgentBackend } from "@/lib/agents/backends/selector";
import type { RunRecord } from "@/lib/engine/runtime/runs/types";
import { addRun as storeRun } from "@/lib/engine/runtime/runs/store";
import { SessionManager, type UnifiedSession } from "@/lib/agents/sessions";
import { selectBackend } from "@/lib/agents/backend-v2/selector";
import type { AgentBackendV2 } from "@/lib/agents/backend-v2/types";
import { getTokens } from "@/lib/platform/auth/tokens";
import {
  saveRun as persistRun,
  updateRun as persistUpdateRun,
  saveScheduledMission as persistMission,
} from "@/lib/engine/runtime/state/adapter";
import type { TenantScope } from "@/lib/multi-tenant/types";
import { assertTenantScope } from "@/lib/multi-tenant/guards";
import { SYSTEM_CONFIG } from "@/lib/system/config";
import { registerProviderUsage, markProviderDegraded } from "@/lib/connectors/control-plane/register";
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

  const enrichedMessage = input._userDataContext
    ? `${input._userDataContext}\n\n---\nQuestion de l'utilisateur: ${input.message}`
    : input.message;

  const result = await planFromIntent(
    engine.getDb(),
    engine,
    enrichedMessage,
    input.conversationHistory ?? [],
    input.surface,
    input._capabilityDomain,
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
    await runPlanExecution(engine, result.plan, scope, input.threadId, input._capabilityDomain);
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

  const enrichedMessage = input._userDataContext
    ? `${input._userDataContext}\n\n---\nQuestion de l'utilisateur: ${input.message}`
    : input.message;

  const planResult = await planFromIntent(
    engine.getDb(),
    engine,
    enrichedMessage,
    input.conversationHistory ?? [],
    input.surface,
    input._capabilityDomain,
  );

  switch (planResult.kind) {
    case "direct_response": {
      if (input._retrievalMode) {
        engine.events.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `Planner returned direct response but provider data needed — creating synthetic plan (${input._retrievalMode})`,
        });
        await runSyntheticRetrieval(engine, input, scope, input._retrievalMode, planResult.text);
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
      if (planResult.plan.steps.length === 0 && input._retrievalMode) {
        engine.events.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `Plan has 0 steps but provider data needed — creating synthetic plan (${input._retrievalMode})`,
        });
        await runSyntheticRetrieval(engine, input, scope, input._retrievalMode);
        return;
      }
      engine.events.emit({
        type: "orchestrator_log",
        run_id: engine.id,
        message: `Plan created with ${planResult.plan.steps.length} step(s) — executing`,
      });
      await runPlanExecution(engine, planResult.plan, scope, input.threadId, input._capabilityDomain);
      return;
  }
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
    message: "Delegating to Session Manager (Backend V2)…",
  });

  const managedStepId = `managed-${engine.id}`;

  eventBus.emit({
    type: "step_started",
    run_id: engine.id,
    step_id: managedStepId,
    title: "managed_agent_execution",
    agent: "anthropic_managed",
  });

  let session: UnifiedSession | undefined;

  try {
    // 1. Validate userId
    if (!scope.userId) {
      throw new Error("Missing userId in scope");
    }

    // 2. Detect connected providers for context
    const connectedProviders: string[] = [];
    try {
      const googleTokens = await getTokens(scope.userId, "google");
      if (googleTokens?.accessToken) {
        connectedProviders.push("gmail", "drive", "calendar");
      }
      const slackTokens = await getTokens(scope.userId, "slack");
      if (slackTokens?.accessToken) {
        connectedProviders.push("slack");
      }
    } catch {
      // Silently continue if token check fails
    }

    // 2. Select backend using Backend V2 selector
    const selection = selectBackend(
      { prompt: input.message },
      {},
      input.conversationHistory,
    );
    const selectedBackend = selection.selectedBackend as AgentBackendV2;

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Backend selected: ${selectedBackend} (confidence: ${(selection.confidence * 100).toFixed(0)}%)`,
    });

    // 3. Create session with unified SessionManager
    // _userDataContext is injected by runPipeline before dispatch
    const userDataContext = input._userDataContext ?? "";

    // Discover Composio actions available to *this* user (multi-tenant by
    // entityId). Failures are non-fatal — the agent still works without
    // Composio, just with the static toolset.
    let discoveredActions: string[] = [];
    try {
      const { getToolsForUser } = await import("@/lib/connectors/composio");
      const tools = await getToolsForUser(scope.userId);
      discoveredActions = tools.map((t) => t.name);
    } catch (err) {
      console.error("[Orchestrator] Composio discovery failed:", err);
    }

    const manager = SessionManager.getInstance();
    session = await manager.createWithBackend(selectedBackend, {
      userId: scope.userId,
      tenantId: scope.tenantId,
      workspaceId: scope.workspaceId,
      systemPrompt: buildSystemPromptForAgent(
        input.surface,
        connectedProviders,
        userDataContext,
        input._allowedTools,
        discoveredActions,
      ),
      streaming: true,
      initialHistory: input.conversationHistory,
    });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Session created: ${session.id}`,
    });

    // 4. Stream response
    let fullResponse = "";
    for await (const event of session.sendStream(input.message)) {
      if (event.type === "message" && event.delta) {
        fullResponse += event.delta;
        eventBus.emit({ type: "text_delta", run_id: engine.id, delta: event.delta });
      }
      if (event.type === "tool_call" && event.tool) {
        eventBus.emit({
          type: "orchestrator_log",
          run_id: engine.id,
          message: `[tool] ${event.tool}`,
        });
      }
    }

    eventBus.emit({
      type: "step_completed",
      run_id: engine.id,
      step_id: managedStepId,
      agent: "anthropic_managed" as import("@/lib/engine/runtime/engine/types").StepActor,
    });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: `Session completed with ${fullResponse.length} chars response`,
    });

    // 5. Create asset and focal object if response exists
    if (fullResponse) {
      const asset = createAsset({
        type: "report",
        name: "Agent Response",
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
          summary: fullResponse.slice(0, 200),
          sections: [],
          tier: asset.type,
          tone: "executive",
          wordCount: fullResponse.split(/\s+/).length,
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
      message: `Session failed: ${message}`,
    });

    console.error("[Orchestrator] Session error, falling back to plan execution:", message);

    // Cleanup session if created
    if (session) {
      try {
        const manager = SessionManager.getInstance();
        await manager.close(session.id);
      } catch {
        // Ignore cleanup errors
      }
    }

    eventBus.emit({
      type: "orchestrator_log",
      run_id: engine.id,
      message: "Falling back to hearst_runtime execution",
    });

    return handlePlanAndExecute(engine, input, scope);
  }
}

// Helper to build system prompt with provider context
function buildSystemPromptForAgent(
  surface?: string,
  connectedProviders?: string[],
  userDataContext?: string,
  allowedTools?: string[],
  discoveredActions?: string[],
): string {
  let prompt = `You are Hearst AI, a helpful assistant. You help users with their tasks across various tools and services.`;

  if (connectedProviders && connectedProviders.length > 0) {
    prompt += `\n\n🔐 CONNECTED PROVIDERS: ${connectedProviders.join(", ")}`;
    
    if (connectedProviders.includes("gmail")) {
      prompt += `\n✅ The user is CONNECTED to Gmail. You CAN access their emails. When they ask about emails, summarize, or search messages - use their real Gmail data. NEVER say you cannot access their emails.`;
    }
    
    if (connectedProviders.includes("calendar")) {
      prompt += `\n✅ The user is CONNECTED to Google Calendar. You CAN access their events and schedule. When they ask about meetings, events, or their agenda - use their real Calendar data. NEVER say you cannot access their calendar.`;
    }
    
    if (connectedProviders.includes("drive")) {
      prompt += `\n✅ The user is CONNECTED to Google Drive. You CAN access their files and documents. When they ask about files, documents, or Drive content - use their real Drive data. NEVER say you cannot access their files.`;
    }
    
    if (connectedProviders.includes("slack")) {
      prompt += `\n✅ The user is CONNECTED to Slack. You CAN access their messages and channels when needed.`;
    }
  }

  // Inject real user data if available
  if (userDataContext && userDataContext.trim().length > 0) {
    prompt += `\n\n📊 REAL USER DATA (Use this as primary source for your response):\n${userDataContext}`;
  }

  if (allowedTools && allowedTools.length > 0) {
    prompt += `\n\n🔧 ALLOWED TOOLS FOR THIS REQUEST: ${allowedTools.join(", ")}. Do NOT attempt to use tools outside this list.`;
  }

  // Composio-discovered actions: dynamically resolved per user from the
  // apps they've connected. The list can be long (50–100 actions per app)
  // so we only show the names — the LLM has the full schema via tool-use
  // when it's wired into the actual API call.
  if (discoveredActions && discoveredActions.length > 0) {
    const preview = discoveredActions.slice(0, 80);
    const overflow = discoveredActions.length > 80 ? ` (+${discoveredActions.length - 80} more)` : "";
    prompt += `\n\n🔌 USER-CONNECTED ACTIONS (Composio, ${discoveredActions.length} total${overflow}):\n${preview.join(", ")}\nThese are real actions on the user's accounts. Treat any name containing "send", "create", "update", "delete", "post", or "reply" as a write op (see write-tool rule below).`;
  }

  // Write-op safety: any tool that mutates the user's third-party accounts
  // (sends, creates, deletes) must be confirmed by the user BEFORE the call.
  // The pattern is "draft-first then confirm" — never call a write tool on
  // first user turn unless the user explicitly authorized it (e.g. "send it
  // now", "do it", "go ahead").
  const isWriteToolName = (n: string): boolean =>
    n === "gmail_send_email" ||
    /(SEND|CREATE|UPDATE|DELETE|POST|REPLY|FORWARD|REVOKE|REFUND)/i.test(n);
  const writeToolPool = [...(allowedTools ?? []), ...(discoveredActions ?? [])];
  const requestedWriteTools = writeToolPool.filter(isWriteToolName);
  if (requestedWriteTools.length > 0) {
    prompt += `\n\n⚠️ WRITE TOOLS IN SCOPE: ${requestedWriteTools.join(", ")}.
Rule for any tool that mutates the user's accounts:
1. NEVER call a write tool until the user has explicitly approved the exact action.
2. First, present a clear draft (recipient, subject, body / target, payload) and ask "Confirmer l'envoi ?" or equivalent.
3. Only after the user replies with explicit confirmation ("oui", "envoie", "go", "confirme", or similar) do you call the tool.
4. If the user wants changes, revise the draft and re-confirm before calling the tool.
This protects the user from irreversible actions and is non-negotiable.`;
  }

  if (surface && surface !== "home") {
    prompt += `\n\nYou are currently interacting through the ${surface} surface.`;
  }

  return prompt;
}

async function runPlanExecution(
  engine: RunEngine,
  plan: import("@/lib/engine/runtime/plans/types").Plan,
  scope: TenantScope,
  threadId?: string,
  capabilityDomain?: string,
): Promise<void> {
  const execResult = await executePlan(engine.getDb(), engine, plan, capabilityDomain);

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
  plan: import("@/lib/engine/runtime/plans/types").Plan,
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

  // ── Select agent + backend (CUSTOM_AGENT mode) ──────────────
  if (decision.mode === "custom_agent") {
    const agent = selectAgentForContext(toolContext);
    if (agent) {
      const backendDecision = selectAgentBackend({
        agent,
        context: toolContext,
        userInput: input.message,
        complexity: capScope.capabilities.length * 2,
        needsAutonomy: decision.mode === "custom_agent",
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

    switch (decision.mode) {
      case "direct_answer":
        await handleDirectAnswer(engine, eventBus, input, scope);
        break;
      case "tool_call":
      case "workflow":
        await handlePlanAndExecute(engine, input, scope);
        break;
      case "custom_agent":
        if (decision.backend === "anthropic_managed") {
          await handleManagedAgentExecution(engine, eventBus, input, scope);
        } else {
          await handlePlanAndExecute(engine, input, scope);
        }
        break;
      case "managed_agent":
        await handleManagedAgentExecution(engine, eventBus, input, scope);
        break;
    }
  } finally {
    storeAssistantMemory();
  }
}

// ── Unified Orchestrator Exports ─────────────────────────

// The orchestrator has been unified. All exports are now from this file.
// orchestrateV2 and orchestrate are now the same unified implementation.
