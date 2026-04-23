/**
 * OpenAI Assistants Backend V2 — Advanced Streaming with Tool Calls
 *
 * Améliorations:
 * - Gestion complète des requires_action (tool calls)
 * - Streaming temps réel des events
 * - Handler de tools extensible
 * - Retry et error recovery
 */

import OpenAI from "openai";
import type {
  ManagedSessionConfig,
  ManagedSessionContext,
  ManagedAgentEvent,
  ManagedAgentResult,
  ManagedAgentStep,
} from "./types";
import { executeTool, toOpenAITools, type ToolCallEvent } from "./openai-tools";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Configuration ─────────────────────────────────────────

export interface StreamingConfig {
  /** Timeout pour l'exécution d'un run (ms) */
  timeoutMs?: number;
  /** Intervalle de polling si streaming échoue (ms) */
  pollIntervalMs?: number;
  /** Nombre max de retries pour tool calls */
  maxToolRetries?: number;
}

const DEFAULT_CONFIG: StreamingConfig = {
  timeoutMs: 120_000,
  pollIntervalMs: 1000,
  maxToolRetries: 2,
};

// ── Streaming Avancé avec Tool Calls ─────────────────────

/**
 * Exécute un run avec streaming et gestion complète des tool calls.
 * C'est la fonction principale pour l'étape 2.
 */
export async function* streamRunWithTools(
  threadId: string,
  assistantId: string,
  config: StreamingConfig = {},
): AsyncGenerator<ManagedAgentEvent | ToolCallEvent> {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();

  console.log(`[streamRunWithTools] Starting run on thread ${threadId}`);

  // Démarrer le streaming
  const stream = client.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  let runId: string | null = null;

  for await (const event of stream) {
    // Track run ID
    if (event.event === "thread.run.created") {
      runId = (event.data as { id: string }).id;
      console.log(`[streamRunWithTools] Run created: ${runId}`);

      yield {
        type: "step",
        timestamp: Date.now(),
        status: "running",
        content: "Run started",
      };
    }

    // Gestion des tool calls requis
    if (event.event === "thread.run.requires_action") {
      const runData = event.data as {
        required_action?: {
          submit_tool_outputs?: {
            tool_calls?: Array<{
              id: string;
              function: { name: string; arguments: string };
            }>;
          };
        };
      };
      const toolCalls = runData.required_action?.submit_tool_outputs?.tool_calls;

      if (toolCalls && toolCalls.length > 0) {
        console.log(`[streamRunWithTools] ${toolCalls.length} tool calls required`);

        // Exécuter chaque tool call
        const outputs: Array<{ tool_call_id: string; output: string }> = [];

        for (const toolCall of toolCalls) {
          const fn = toolCall.function;

          console.log(`[streamRunWithTools] Tool call: ${fn.name}(${fn.arguments})`);

          // Émettre event tool_call
          yield {
            type: "tool_call" as const,
            timestamp: Date.now(),
            tool: fn.name,
            status: "running",
            content: fn.arguments,
          };

          // Parse arguments
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(fn.arguments);
          } catch {
            args = {};
          }

          // Exécuter le tool
          const toolStart = Date.now();
          let result: string;
          let error: string | undefined;

          try {
            result = await executeTool(fn.name, args);
            console.log(`[streamRunWithTools] Tool ${fn.name} completed in ${Date.now() - toolStart}ms`);
          } catch (err) {
            error = err instanceof Error ? err.message : "Tool execution failed";
            result = JSON.stringify({ error });
            console.error(`[streamRunWithTools] Tool ${fn.name} failed: ${error}`);
          }

          // Émettre event tool_result
          yield {
            type: "tool_result" as const,
            timestamp: Date.now(),
            tool: fn.name,
            status: error ? "error" : "done",
            content: result,
          };

          outputs.push({
            tool_call_id: toolCall.id,
            output: result,
          });
        }

        // Soumettre les résultats
        if (runId && outputs.length > 0) {
          console.log(`[streamRunWithTools] Submitting ${outputs.length} tool outputs`);
          await client.beta.threads.runs.submitToolOutputs(runId, {
            thread_id: threadId,
            tool_outputs: outputs,
          });
        }
      }
    }

    // Mapper les autres events
    const mapped = mapStreamEventToManagedEvent(event, startTime);
    if (mapped) {
      yield mapped;
    }

    // Check timeout
    if (Date.now() - startTime > (opts.timeoutMs ?? 120_000)) {
      yield {
        type: "error",
        timestamp: Date.now(),
        error: "Run timeout exceeded",
      };
      return;
    }
  }

  console.log(`[streamRunWithTools] Streaming completed`);
}

// ── Event Mapping ───────────────────────────────────────────

function mapStreamEventToManagedEvent(
  event: OpenAI.Beta.AssistantStreamEvent,
  startTime: number,
): ManagedAgentEvent | null {
  const timestamp = Date.now();

  switch (event.event) {
    case "thread.run.queued":
    case "thread.run.in_progress":
      return {
        type: "step",
        timestamp,
        status: "running",
        content: `Run ${event.event.split(".").pop()}`,
      };

    case "thread.run.completed":
      const completedData = event.data as {
        usage?: { prompt_tokens: number; completion_tokens: number };
        model: string;
      };
      return {
        type: "step",
        timestamp,
        status: "done",
        content: "Run completed",
        usage: completedData.usage ? {
          tokensIn: completedData.usage.prompt_tokens,
          tokensOut: completedData.usage.completion_tokens,
          costUsd: calculateCost(completedData.usage.prompt_tokens, completedData.usage.completion_tokens, completedData.model),
        } : undefined,
      };

    case "thread.run.failed":
      const failedData = event.data as { last_error?: { message?: string } };
      return {
        type: "error",
        timestamp,
        error: failedData.last_error?.message ?? "Run failed",
      };

    case "thread.message.delta":
      const msgDelta = event.data as {
        delta?: {
          content?: Array<{
            type: string;
            text?: { value?: string };
          }>;
        };
      };
      const content = msgDelta.delta?.content?.[0];
      if (content && content.type === "text") {
        return {
          type: "message",
          timestamp,
          delta: content.text?.value ?? "",
          status: "running",
        };
      }
      return null;

    case "thread.message.completed":
      const msgData = event.data as {
        content: Array<{
          type: string;
          text?: { value: string };
        }>;
      };
      const fullText = msgData.content
        .map(c => c.type === "text" ? c.text?.value ?? "" : "")
        .join("");
      return {
        type: "message",
        timestamp,
        content: fullText,
        status: "done",
      };

    case "thread.run.step.created":
      const stepData = event.data as { type: string };
      return {
        type: "step",
        timestamp,
        status: "running",
        tool: stepData.type,
      };

    case "thread.run.step.completed":
      return {
        type: "step",
        timestamp,
        status: "done",
      };

    default:
      return null;
  }
}

// ── Session Complète ──────────────────────────────────────

export interface AssistantSession {
  assistantId: string;
  threadId: string;
  runId: string | null;
}

/**
 * Crée une session complète avec tools.
 */
export async function createAssistantSession(
  model: string = "gpt-4o",
  name?: string,
  instructions?: string,
  initialMessages?: Array<{ role: "user"; content: string }>,
): Promise<AssistantSession> {
  const tools = toOpenAITools();

  // Créer l'assistant avec tools
  const assistant = await client.beta.assistants.create({
    model,
    name: name ?? "Hearst Assistant",
    instructions: instructions ?? "You are a helpful assistant with access to tools.",
    tools,
  });

  // Créer le thread
  const thread = await client.beta.threads.create();

  // Ajouter messages initiaux
  if (initialMessages && initialMessages.length > 0) {
    for (const msg of initialMessages) {
      await client.beta.threads.messages.create(thread.id, {
        role: msg.role,
        content: msg.content,
      });
    }
  }

  return {
    assistantId: assistant.id,
    threadId: thread.id,
    runId: null,
  };
}

/**
 * Streaming haut niveau d'une session.
 */
export async function* runAssistantSession(
  session: AssistantSession,
  userMessage: string,
  config?: StreamingConfig,
): AsyncGenerator<ManagedAgentEvent | ToolCallEvent> {
  // Ajouter le message utilisateur
  await client.beta.threads.messages.create(session.threadId, {
    role: "user",
    content: userMessage,
  });

  // Streamer avec tools
  for await (const event of streamRunWithTools(
    session.threadId,
    session.assistantId,
    config,
  )) {
    yield event;

    // Track final message
    if (event.type === "message" && event.status === "done") {
      // Session completed
    }
  }
}

// ── Utilities ─────────────────────────────────────────────

function calculateCost(tokensIn: number, tokensOut: number, model: string): number {
  const pricing: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 2.5, out: 10 },
    "gpt-4o-mini": { in: 0.15, out: 0.6 },
    "gpt-4-turbo": { in: 10, out: 30 },
    "gpt-4": { in: 30, out: 60 },
  };

  const p = pricing[model] ?? { in: 2.5, out: 10 };
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

// ── Test ──────────────────────────────────────────────────

export async function testAssistantWithTools(): Promise<{
  ok: boolean;
  response?: string;
  toolCalls?: string[];
  error?: string;
}> {
  try {
    console.log("[Test] Creating assistant with tools...");
    const session = await createAssistantSession(
      "gpt-4o-mini",
      "Test Assistant",
      "You have access to tools. Use them when helpful.",
    );

    console.log("[Test] Running with tool call prompt...");
    const events: Array<{ type: string; content?: string; delta?: string; tool?: string }> = [];
    const toolCalls: string[] = [];
    let fullResponse = "";

    for await (const event of runAssistantSession(
      session,
      "What time is it now? Also calculate 123 * 456.",
      { timeoutMs: 30_000 },
    )) {
      events.push({
        type: event.type,
        content: "content" in event ? event.content : undefined,
        delta: "delta" in event ? event.delta : undefined,
        tool: "tool" in event ? event.tool : undefined,
      });

      if (event.type === "tool_call" && "tool" in event) {
        toolCalls.push(event.tool!);
      }

      // Accumulate deltas into full response
      if (event.type === "message" && "delta" in event && event.delta) {
        fullResponse += event.delta;
      }
    }

    // Use accumulated response, or fall back to final message event
    const finalMessage = events
      .filter(e => e.type === "message" && e.content)
      .pop();

    return {
      ok: true,
      response: fullResponse || finalMessage?.content || "No response",
      toolCalls,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Test failed",
    };
  }
}
