/**
 * Orchestrator V2 — Intégration Session Manager + Backend Selector
 *
 * Nouvelle orchestration utilisant Backend V2:
 * - Backend Selector pour choix automatique
 * - Session Manager pour interface unifiée
 * - Handoff dynamique entre backends
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { SessionManager, createSession, type UnifiedSession } from "../agents/sessions";
import { selectBackend } from "../agents/backend-v2/selector";
import type { ManagedAgentEvent } from "../agents/backend-v2/types";
import { RunEventBus } from "../events/bus";
import { SSEAdapter } from "../events/consumers/sse-adapter";
import { SYSTEM_CONFIG } from "../system/config";
import { toOpenAITools, type ToolDefinition } from "../agents/backend-v2/openai-tools";
import { getConnectionsByScope } from "../connectors/control-plane/store";

// ── Types ───────────────────────────────────────────────────

interface OrchestrateV2Input {
  userId: string;
  message: string;
  conversationId?: string;
  threadId?: string;
  surface?: string;
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>;
  /** Force a specific backend */
  forceBackend?: string;
  /** Enable streaming */
  streaming?: boolean;
  tenantId?: string;
  workspaceId?: string;
}

interface OrchestrateV2Result {
  success: boolean;
  sessionId: string;
  backend: string;
  response?: string;
  error?: string;
  metrics?: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    latencyMs: number;
  };
}

// ── Main Orchestration ──────────────────────────────────────

/**
 * Orchestrate using Backend V2 (Session Manager + Backend Selector)
 * Returns SSE stream.
 */
export function orchestrateV2(
  db: SupabaseClient,
  input: OrchestrateV2Input,
): ReadableStream {
  const eventBus = new RunEventBus();
  const sse = new SSEAdapter(eventBus);

  const stream = new ReadableStream({
    start(controller) {
      sse.pipe(controller);

      runV2Pipeline(db, eventBus, sse, input)
        .catch((err) => {
          console.error("[OrchestratorV2] pipeline error:", err);
          sse.sendError(err);
        })
        .finally(() => {
          sse.close();
          eventBus.destroy();
        });
    },
  });

  return stream;
}

/**
 * Non-streaming version for simple requests.
 */
export async function orchestrateV2Blocking(
  db: SupabaseClient,
  input: OrchestrateV2Input,
): Promise<OrchestrateV2Result> {
  const startTime = Date.now();

  try {
    // 1. Select backend
    const selection = selectBackend(
      { prompt: input.message },
      input.forceBackend ? { forceBackend: input.forceBackend } : {},
      input.conversationHistory,
    );

    // 2. Create session
    const manager = SessionManager.getInstance();
    const session = input.forceBackend
      ? await manager.createWithBackend(input.forceBackend as any, {
          userId: input.userId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          systemPrompt: buildSystemPrompt(input.surface),
        })
      : await manager.create(input.message, {
          userId: input.userId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          systemPrompt: buildSystemPrompt(input.surface),
        });

    // 3. Send message
    const response = await session.send(input.message);

    // 4. Persist to memory
    await persistConversation(db, input, session.id, input.message, response.message.content);

    // 5. Get metrics
    const metrics = session.getMetrics();

    return {
      success: true,
      sessionId: session.id,
      backend: session.backend,
      response: response.message.content,
      metrics: {
        tokensIn: metrics.totalTokensIn,
        tokensOut: metrics.totalTokensOut,
        costUsd: metrics.totalCostUsd,
        latencyMs: Date.now() - startTime,
      },
    };
  } catch (error) {
    return {
      success: false,
      sessionId: "",
      backend: input.forceBackend || "unknown",
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

// ── Pipeline ───────────────────────────────────────────────

async function runV2Pipeline(
  _db: SupabaseClient,
  eventBus: RunEventBus,
  sse: SSEAdapter,
  input: OrchestrateV2Input,
): Promise<void> {
  const startTime = Date.now();
  const runId = generateRunId();

  // Emit start event
  eventBus.emit({
    type: "orchestrator_log",
    run_id: runId,
    message: "[V2] Starting orchestration with Backend V2",
  });

  try {
    // 1. Detect Context (inbox, calendar, files, etc.)
    const toolContext = detectToolContext(input.message, input.surface);
    const availableConnectors = await getAvailableConnectors(input.userId, input.tenantId, input.workspaceId);
    const hasRelevantConnector = !!(toolContext && availableConnectors.includes(toolContext));

    if (toolContext) {
      eventBus.emit({
        type: "orchestrator_log",
        run_id: runId,
        message: `[V2] Context detected: ${toolContext} | Connector available: ${hasRelevantConnector ? "YES" : "NO"}`,
      });
    }

    // 2. Backend Selection
    const selectionStart = Date.now();
    const selection = selectBackend(
      { prompt: input.message },
      input.forceBackend ? { forceBackend: input.forceBackend } : {},
      input.conversationHistory,
    );

    eventBus.emit({
      type: "orchestrator_log",
      run_id: runId,
      message: `[V2] Backend selected: ${selection.selectedBackend} (confidence: ${(selection.confidence * 100).toFixed(0)}%)`,
    });

    // Emit reasoning
    for (const reason of selection.reasoning.slice(0, 3)) {
      eventBus.emit({
        type: "orchestrator_log",
        run_id: runId,
        message: `[V2] ${reason}`,
      });
    }

    // Force Assistants API if tools/connectors needed
    let selectedBackend = selection.selectedBackend;
    if (hasRelevantConnector && selectedBackend === "openai_responses") {
      eventBus.emit({
        type: "orchestrator_log",
        run_id: runId,
        message: `[V2] Switching to openai_assistants for tool support`,
      });
      selectedBackend = "openai_assistants";
    }

    // 2. Session Creation
    const sessionStart = Date.now();
    const manager = SessionManager.getInstance();

    const session = input.forceBackend
      ? await manager.createWithBackend(selectedBackend, {
          userId: input.userId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          systemPrompt: buildSystemPrompt(input.surface, hasRelevantConnector, toolContext),
          streaming: input.streaming ?? true,
        })
      : await manager.create(input.message, {
          userId: input.userId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          systemPrompt: buildSystemPrompt(input.surface, hasRelevantConnector, toolContext),
          streaming: input.streaming ?? true,
        });

    eventBus.emit({
      type: "orchestrator_log",
      run_id: runId,
      message: `[V2] Session created: ${session.id} (${Date.now() - sessionStart}ms)`,
    });

    // 3. Stream Response
    let fullResponse = "";
    let tokenCount = 0;
    let costUsd = 0;

    for await (const event of session.sendStream(input.message)) {
      // Map ManagedAgentEvent to SSE events
      mapAndEmitEvent(eventBus, runId, event);

      // Track response
      if (event.type === "message") {
        if (event.delta) {
          fullResponse += event.delta;
          eventBus.emit({ type: "text_delta", run_id: runId, delta: event.delta });
        }
        if (event.content) {
          fullResponse = event.content;
        }
        if (event.usage) {
          tokenCount = (event.usage.tokensIn ?? 0) + (event.usage.tokensOut ?? 0);
          costUsd = event.usage.costUsd ?? 0;
        }
      }

      if (event.type === "tool_call") {
        eventBus.emit({
          type: "tool_call_started",
          run_id: runId,
          step_id: `step_${Date.now()}`,
          tool: event.tool ?? "unknown",
        });
      }
    }

    // 4. Final Metrics
    const metrics = session.getMetrics();
    const totalTime = Date.now() - startTime;

    eventBus.emit({
      type: "orchestrator_log",
      run_id: runId,
      message: `[V2] Completed in ${totalTime}ms | Tokens: ${metrics.totalTokensIn + metrics.totalTokensOut} | Cost: $${metrics.totalCostUsd.toFixed(4)}`,
    });

    // 5. Completion
    eventBus.emit({
      type: "run_completed",
      run_id: runId,
      artifacts: [], // No artifacts for simple chat
    });

    // Emit metrics as log
    eventBus.emit({
      type: "orchestrator_log",
      run_id: runId,
      message: `[V2] Metrics: ${totalTime}ms | Tokens: ${metrics.totalTokensIn + metrics.totalTokensOut} | Cost: $${metrics.totalCostUsd.toFixed(4)} | Backend: ${session.backend}`,
    });

    // Optional: Close session if not needed for follow-up
    // await session.close();

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[OrchestratorV2] Error:", error);

    eventBus.emit({
      type: "orchestrator_log",
      run_id: runId,
      message: `[V2] Error: ${errorMsg}`,
    });

    eventBus.emit({
      type: "run_failed",
      run_id: runId,
      error: errorMsg,
    });
  }
}

// ── Event Mapping ───────────────────────────────────────────

function mapAndEmitEvent(
  eventBus: RunEventBus,
  runId: string,
  event: ManagedAgentEvent,
): void {
  switch (event.type) {
    case "step":
      eventBus.emit({
        type: "orchestrator_log",
        run_id: runId,
        message: `[V2] Step: ${event.content}`,
      });
      break;

    case "message":
      if (event.delta) {
        eventBus.emit({
          type: "text_delta",
          run_id: runId,
          delta: event.delta,
        });
      }
      break;

    case "tool_call":
      eventBus.emit({
        type: "tool_call_started",
        run_id: runId,
        step_id: `step_${Date.now()}`,
        tool: event.tool ?? "unknown",
      });
      break;

    case "thinking":
      eventBus.emit({
        type: "orchestrator_log",
        run_id: runId,
        message: `[V2] Thinking: ${event.content}`,
      });
      break;

    case "error":
      eventBus.emit({
        type: "run_failed",
        run_id: runId,
        error: event.error ?? "Unknown error",
      });
      break;

    case "idle":
      // Completion handled at pipeline level
      break;
  }
}

// ── Helpers ─────────────────────────────────────────────────

function generateRunId(): string {
  return `v2_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
}

function buildSystemPrompt(surface?: string, hasConnector?: boolean, toolContext?: string | null): string {
  let prompt = `You are Hearst AI, a helpful assistant. You help users with their tasks across various tools and services.`;

  // Add connector availability info
  if (hasConnector && toolContext) {
    switch (toolContext) {
      case "inbox":
        prompt += `\n\n🔧 CONNECTOR AVAILABLE: The user is connected to Gmail. You can help them with their emails - summarize, search, analyze, or extract information from their inbox. Do not say you cannot access their emails - you can access them through the Gmail connection.`;
        break;
      case "calendar":
        prompt += `\n\n🔧 CONNECTOR AVAILABLE: The user is connected to Google Calendar. You can help them with their schedule, events, and meetings.`;
        break;
      case "files":
        prompt += `\n\n🔧 CONNECTOR AVAILABLE: The user is connected to Google Drive. You can help them search, analyze, and work with their documents and files.`;
        break;
    }
  }

  if (surface && surface !== "home") {
    prompt += `\n\nYou are currently interacting through the ${surface} surface.`;
  }

  return prompt;
}

async function persistConversation(
  _db: SupabaseClient,
  input: OrchestrateV2Input,
  _sessionId: string,
  _userMessage: string,
  _assistantResponse: string,
): Promise<void> {
  try {
    const _threadId = input.threadId ?? input.conversationId;
    // TODO: Implement with correct memory store signature
    // Memory persistence is non-blocking for V2
  } catch (error) {
    console.warn("[OrchestratorV2] Failed to persist conversation:", error);
    // Non-blocking
  }
}

// ── Tool Context Detection ──────────────────────────────────

const CONTEXT_KEYWORDS: Array<{ context: string; keywords: string[] }> = [
  { context: "inbox", keywords: ["email", "emails", "message", "mail", "inbox", "gmail", "courrier", "résumé", "résumer"] },
  { context: "calendar", keywords: ["agenda", "réunion", "calendrier", "événement", "planning", "rdv", "rendez-vous"] },
  { context: "files", keywords: ["fichier", "fichiers", "document", "documents", "drive", "pdf", "doc"] },
];

function detectToolContext(message: string, surface?: string): string | null {
  // First check surface
  if (surface && surface !== "home") {
    if (["inbox", "calendar", "files"].includes(surface)) {
      return surface;
    }
  }

  // Then check message keywords
  const lower = message.toLowerCase();
  for (const { context, keywords } of CONTEXT_KEYWORDS) {
    if (keywords.some(kw => lower.includes(kw))) {
      return context;
    }
  }

  return null;
}

// ── Connector Availability ─────────────────────────────────

async function getAvailableConnectors(userId: string, tenantId?: string, workspaceId?: string): Promise<string[]> {
  try {
    const connections = await getConnectionsByScope({
      tenantId: tenantId || "dev-tenant",
      workspaceId: workspaceId || "dev-workspace",
      userId,
    });
    return connections
      .filter(c => c.status === "connected")
      .map(c => c.provider);
  } catch {
    return [];
  }
}

// ── Feature Flags ─────────────────────────────────────────────

export function isV2Enabled(): boolean {
  return SYSTEM_CONFIG.orchestratorV2?.enabled ?? false;
}

export function getV2RolloutPercentage(): number {
  return SYSTEM_CONFIG.orchestratorV2?.rolloutPercentage ?? 0;
}

export function shouldUseV2(userId: string): boolean {
  if (!isV2Enabled()) return false;

  const rollout = getV2RolloutPercentage();
  if (rollout >= 100) return true;
  if (rollout <= 0) return false;

  // Simple hash-based rollout
  const hash = userId.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  return (hash % 100) < rollout;
}
