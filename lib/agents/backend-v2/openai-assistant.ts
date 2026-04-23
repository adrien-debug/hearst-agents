/**
 * OpenAI Assistants API Backend
 *
 * Implémentation du backend OpenAI Assistants pour le système backend-v2.
 * Supporte: threads, assistants, runs, streaming, file search, code interpreter.
 */

import OpenAI from "openai";
import type {
  ManagedSessionConfig,
  ManagedSessionContext,
  ManagedAgentEvent,
  ManagedAgentResult,
  ManagedAgentStep,
} from "./types";

// ── Configuration ─────────────────────────────────────────

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.warn("[OpenAIAssistant] OPENAI_API_KEY not set");
}

const client = new OpenAI({ apiKey: OPENAI_API_KEY });

// ── Types Internes ────────────────────────────────────────

export interface AssistantConfig {
  model: string;
  name?: string;
  description?: string;
  instructions?: string;
  tools?: OpenAI.Beta.AssistantTool[];
  fileIds?: string[];
  metadata?: Record<string, string>;
}

export interface ThreadMessage {
  role: "user" | "assistant";
  content: string;
  attachments?: OpenAI.Beta.Threads.MessageCreateParams.Attachment[];
}

// ── Assistant Lifecycle ───────────────────────────────────

/**
 * Crée ou récupère un assistant OpenAI.
 * En production, on réutilise les assistants existants par agentId.
 */
export async function createOrGetAssistant(
  config: AssistantConfig,
): Promise<string> {
  const assistant = await client.beta.assistants.create({
    model: config.model,
    name: config.name ?? "Hearst Assistant",
    description: config.description,
    instructions: config.instructions,
    tools: config.tools ?? [],
    tool_resources: config.fileIds ? {
      file_search: {
        vector_store_ids: config.fileIds,
      },
    } : undefined,
    metadata: config.metadata,
  });

  return assistant.id;
}

/**
 * Crée un nouveau thread de conversation.
 */
export async function createThread(
  messages?: ThreadMessage[],
): Promise<string> {
  console.log("[createThread] Starting with messages:", messages?.length ?? 0);

  // Créer le thread sans messages d'abord
  const thread = await client.beta.threads.create();
  console.log("[createThread] Thread created:", thread.id);

  // Ajouter les messages séparément si nécessaire
  if (messages && messages.length > 0) {
    for (const msg of messages) {
      await client.beta.threads.messages.create(thread.id, {
        role: msg.role,
        content: msg.content,
      });
    }
    console.log("[createThread] Messages added:", messages.length);
  }

  return thread.id;
}

/**
 * Ajoute un message à un thread existant.
 */
export async function addMessageToThread(
  threadId: string,
  message: ThreadMessage,
): Promise<string> {
  const msg = await client.beta.threads.messages.create(threadId, {
    role: message.role,
    content: message.content,
    attachments: message.attachments,
  });

  return msg.id;
}

// ── Run Execution ─────────────────────────────────────────

/**
 * Exécute un run sur un thread avec un assistant.
 * Version bloquante (sans streaming) - pour tests et fallback.
 */
export async function runAssistant(
  threadId: string,
  assistantId: string,
  options?: {
    instructions?: string;
    additionalInstructions?: string;
    tools?: OpenAI.Beta.AssistantTool[];
    maxCompletionTokens?: number;
    timeoutMs?: number;
  },
): Promise<{
  runId: string;
  status: string;
  messages: OpenAI.Beta.Threads.Message[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}> {
  // Validation
  if (!threadId || typeof threadId !== 'string') {
    throw new Error(`Invalid threadId: ${threadId}`);
  }
  if (!assistantId || typeof assistantId !== 'string') {
    throw new Error(`Invalid assistantId: ${assistantId}`);
  }

  console.log(`[runAssistant] Creating run on thread ${threadId} with assistant ${assistantId}`);

  // Créer le run
  let run = await client.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    instructions: options?.instructions,
    additional_instructions: options?.additionalInstructions,
    tools: options?.tools,
    max_completion_tokens: options?.maxCompletionTokens,
  });

  console.log(`[runAssistant] Run created: ${run.id}, status: ${run.status}`);

  const timeoutMs = options?.timeoutMs ?? 120_000;
  const startTime = Date.now();

  // Polling jusqu'à completion
  const runId = run.id; // Garder une référence stable
  while (["queued", "in_progress", "cancelling"].includes(run.status)) {
    if (Date.now() - startTime > timeoutMs) {
      throw new Error(`Run timeout after ${timeoutMs}ms`);
    }

    await new Promise(r => setTimeout(r, 1000));
    console.log(`[runAssistant] Polling run ${runId} on thread ${threadId}, status: ${run.status}`);

    // Nouvelle signature SDK: retrieve(runId, { thread_id: threadId })
    const retrieved = await client.beta.threads.runs.retrieve(runId, {
      thread_id: threadId,
    });
    run = retrieved;
  }

  console.log(`[runAssistant] Run completed with status: ${run.status}`);

  // Gérer requires_action (tool calls)
  if (run.status === "requires_action") {
    // Pour l'instant, on rejette - le streaming gérera ça mieux
    throw new Error("Run requires action - use streaming mode for tool calls");
  }

  if (run.status === "failed" || run.status === "cancelled" || run.status === "expired") {
    throw new Error(`Run ${run.status}: ${run.last_error?.message ?? "Unknown error"}`);
  }

  // Récupérer les messages
  const messages = await client.beta.threads.messages.list(threadId, {
    order: "desc",
    limit: 50,
  });

  return {
    runId: run.id,
    status: run.status,
    messages: messages.data,
    usage: run.usage ?? undefined,
  };
}

// ── Streaming Execution ───────────────────────────────────

/**
 * Exécute un run avec streaming SSE.
 * Génère des événements pour tool_calls, messages, etc.
 */
export async function* streamRun(
  threadId: string,
  assistantId: string,
  options?: {
    instructions?: string;
    additionalInstructions?: string;
    tools?: OpenAI.Beta.AssistantTool[];
    maxCompletionTokens?: number;
    onToolCall?: (toolCall: OpenAI.Beta.Threads.Runs.RequiredActionFunctionToolCall) => Promise<string>;
  },
): AsyncGenerator<ManagedAgentEvent> {
  const startTime = Date.now();
  let runId: string | null = null;

  try {
    // Créer le run avec streaming
    const stream = client.beta.threads.runs.stream(threadId, {
      assistant_id: assistantId,
      instructions: options?.instructions,
      additional_instructions: options?.additionalInstructions,
      tools: options?.tools,
      max_completion_tokens: options?.maxCompletionTokens,
    });

    for await (const event of stream) {
      // Extraire runId du premier event (uniquement pour ThreadRunCreated)
      if (!runId && event.event === "thread.run.created") {
        const runData = event.data as { id: string };
        runId = runData.id;
      }

      // Mapper les events OpenAI vers ManagedAgentEvent
      const mappedEvent = mapStreamEvent(event, startTime);
      if (mappedEvent) {
        yield mappedEvent;
      }

      // Gérer requires_action pour tool calls
      if (event.event === "thread.run.requires_action") {
        const toolCalls = event.data.required_action?.submit_tool_outputs?.tool_calls;
        if (toolCalls && options?.onToolCall) {
          // Émettre event tool_call
          for (const toolCall of toolCalls) {
            yield {
              type: "tool_call",
              timestamp: Date.now(),
              tool: toolCall.function.name,
              status: "running",
              content: toolCall.function.arguments,
            };
          }

          // Exécuter les tools
          const outputs = await Promise.all(
            toolCalls.map(async tc => ({
              tool_call_id: tc.id,
              output: await options.onToolCall!(tc),
            }))
          );

          // Soumettre les résultats
          await client.beta.threads.runs.submitToolOutputs(runId!, {
            thread_id: threadId,
            tool_outputs: outputs,
          });

          // Émettre completions
          for (const toolCall of toolCalls) {
            yield {
              type: "tool_result",
              timestamp: Date.now(),
              tool: toolCall.function.name,
              status: "done",
            };
          }
        }
      }
    }
  } catch (error) {
    yield {
      type: "error",
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Mappe les events de streaming OpenAI vers notre format unifié.
 */
function mapStreamEvent(
  event: OpenAI.Beta.AssistantStreamEvent,
  startTime: number,
): ManagedAgentEvent | null {
  const timestamp = Date.now();

  switch (event.event) {
    case "thread.run.created":
    case "thread.run.queued":
    case "thread.run.in_progress":
      return {
        type: "step",
        timestamp,
        status: "running",
        content: `Run ${event.event.split(".").pop()}`,
      };

    case "thread.run.completed":
      return {
        type: "step",
        timestamp,
        status: "done",
        content: "Run completed",
        usage: event.data.usage ? {
          tokensIn: event.data.usage.prompt_tokens,
          tokensOut: event.data.usage.completion_tokens,
        } : undefined,
      };

    case "thread.run.failed":
      return {
        type: "error",
        timestamp,
        error: event.data.last_error?.message ?? "Run failed",
      };

    case "thread.message.created":
    case "thread.message.in_progress":
      return {
        type: "step",
        timestamp,
        status: "running",
        content: "Generating message...",
      };

    case "thread.message.delta":
      const delta = event.data.delta;
      if (delta.content && delta.content.length > 0) {
        const textDelta = delta.content.find(c => c.type === "text")?.text?.value ?? "";
        return {
          type: "message",
          timestamp,
          delta: textDelta,
          status: "running",
        };
      }
      return null;

    case "thread.message.completed":
      const fullContent = event.data.content
        .map(c => c.type === "text" ? c.text.value : "")
        .join("");
      return {
        type: "message",
        timestamp,
        content: fullContent,
        status: "done",
      };

    case "thread.run.requires_action":
      return {
        type: "thinking",
        timestamp,
        content: "Tools required...",
      };

    case "thread.run.step.created":
      return {
        type: "step",
        timestamp,
        status: "running",
        tool: event.data.type,
      };

    case "thread.run.step.completed":
      return {
        type: "step",
        timestamp,
        status: "done",
        tool: event.data.type,
      };

    default:
      return null;
  }
}

// ── High-Level Session Interface ──────────────────────────

/**
 * Exécute une session complète avec OpenAI Assistants.
 * Interface haut niveau compatible avec backend-v2.
 */
export async function* runOpenAIAssistantSession(
  config: ManagedSessionConfig,
  assistantConfig: AssistantConfig,
): AsyncGenerator<ManagedAgentEvent> {
  const startTime = Date.now();
  const steps: ManagedAgentStep[] = [];

  try {
    // 1. Créer ou récupérer l'assistant
    yield { type: "thinking", timestamp: Date.now(), content: "Initializing assistant..." };

    const assistantId = await createOrGetAssistant({
      ...assistantConfig,
      instructions: assistantConfig.instructions ?? config.prompt,
    });

    // 2. Créer ou utiliser un thread existant
    const threadId = config.threadId ?? await createThread();

    // 3. Ajouter le message utilisateur si nouveau thread
    if (!config.threadId) {
      await addMessageToThread(threadId, {
        role: "user",
        content: config.prompt,
      });
    }

    // 4. Exécuter avec streaming
    let fullText = "";
    let usage: { tokensIn: number; tokensOut: number } | undefined;

    for await (const event of streamRun(threadId, assistantId)) {
      yield event;

      if (event.type === "message" && event.content) {
        fullText = event.content;
      }

      if (event.type === "step" && event.status === "done" && event.usage) {
        usage = {
          tokensIn: event.usage.tokensIn ?? 0,
          tokensOut: event.usage.tokensOut ?? 0,
        };
      }
    }

    // 5. Final
    yield {
      type: "idle",
      timestamp: Date.now(),
      content: fullText,
      usage: usage ? {
        tokensIn: usage.tokensIn,
        tokensOut: usage.tokensOut,
        costUsd: calculateCost(usage.tokensIn, usage.tokensOut, assistantConfig.model),
      } : undefined,
    };

  } catch (error) {
    yield {
      type: "error",
      timestamp: Date.now(),
      error: error instanceof Error ? error.message : "Session failed",
    };
  }
}

// ── Utilities ───────────────────────────────────────────────

function calculateCost(tokensIn: number, tokensOut: number, model: string): number {
  // Tarifs approximatifs OpenAI (mise à jour 2024)
  const pricing: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 2.5, out: 10 },           // $2.50 / 1M tokens in
    "gpt-4o-mini": { in: 0.15, out: 0.6 },   // $0.15 / 1M tokens in
    "gpt-4-turbo": { in: 10, out: 30 },      // $10 / 1M tokens in
    "gpt-4": { in: 30, out: 60 },            // $30 / 1M tokens in
  };

  const p = pricing[model] ?? { in: 2.5, out: 10 };

  // Return cost in USD
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

// ── Test Function ───────────────────────────────────────────

/**
 * Test rapide du backend Assistants.
 * À utiliser pour valider la configuration OpenAI.
 */
export async function testAssistantBackend(): Promise<{
  ok: boolean;
  assistantId?: string;
  threadId?: string;
  error?: string;
}> {
  try {
    console.log("[TestAssistant] Creating assistant...");
    const assistant = await createOrGetAssistant({
      model: "gpt-4o-mini",
      name: "Test Assistant",
      instructions: "You are a helpful test assistant. Respond with 'Hello from Hearst'.",
    });
    console.log("[TestAssistant] Assistant created:", assistant);

    console.log("[TestAssistant] Creating thread...");
    const thread = await createThread([{
      role: "user",
      content: "Say hello",
    }]);
    console.log("[TestAssistant] Thread created:", thread);

    if (!thread || typeof thread !== 'string') {
      throw new Error(`Invalid thread ID: ${thread}`);
    }

    console.log("[TestAssistant] Running assistant with thread:", thread);
    const result = await runAssistant(thread, assistant, {
      timeoutMs: 30_000,
    });
    console.log("[TestAssistant] Run completed:", result.runId, result.status);

    const lastMessage = result.messages
      .filter(m => m.role === "assistant")
      .pop();

    const content = lastMessage?.content
      .map(c => c.type === "text" ? c.text.value : "")
      .join("") ?? "";

    console.log("[TestAssistant] Assistant response:", content);

    return {
      ok: content.toLowerCase().includes("hello"),
      assistantId: assistant,
      threadId: thread,
    };
  } catch (error) {
    console.error("[TestAssistant] Error:", error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Test failed",
    };
  }
}
