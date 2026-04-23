/**
 * OpenAI Responses API Backend
 *
 * API stateless, rapide, sans gestion de threads/assistants.
 * Parfaite pour les requêtes simples où on n'a pas besoin de persistance.
 */

import OpenAI from "openai";
import type {
  ManagedSessionConfig,
  ManagedAgentEvent,
} from "./types";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── Types ───────────────────────────────────────────────────

export interface ResponsesConfig {
  model: string;
  temperature?: number;
  max_tokens?: number;
  tools?: OpenAI.Responses.Tool[];
  previousResponseId?: string; // Pour la continuité conversationnelle
}

export interface ResponseInput {
  role: "user" | "system" | "assistant";
  content: string;
}

// ── Simple Response (Non-streaming) ─────────────────────────

/**
 * Génère une réponse simple (bloquante).
 * Parfait pour les tâches rapides sans nécessité de streaming.
 */
export async function generateResponse(
  inputs: ResponseInput[],
  config: ResponsesConfig,
): Promise<{
  id: string;
  text: string;
  model: string;
  usage: { input_tokens: number; output_tokens: number };
  costUsd: number;
}> {
  const startTime = Date.now();

  const response = await client.responses.create({
    model: config.model,
    input: inputs.map(i => ({
      role: i.role,
      content: i.content,
    })),
    temperature: config.temperature ?? 0.7,
    max_output_tokens: config.max_tokens,
    tools: config.tools,
    ...(config.previousResponseId && { previous_response_id: config.previousResponseId }),
  });

  // Extraire le texte
  const text = response.output
    .filter(item => item.type === "message")
    .flatMap(item => item.content)
    .filter(content => content.type === "output_text")
    .map(content => content.text)
    .join("");

  // Calculer le coût
  const costUsd = calculateCost(
    response.usage?.input_tokens ?? 0,
    response.usage?.output_tokens ?? 0,
    config.model,
  );

  return {
    id: response.id,
    text,
    model: response.model,
    usage: {
      input_tokens: response.usage?.input_tokens ?? 0,
      output_tokens: response.usage?.output_tokens ?? 0,
    },
    costUsd,
  };
}

// ── Streaming Response ─────────────────────────────────────

/**
 * Génère une réponse en streaming.
 * Émet des events en temps réel pour l'UI.
 */
export async function* streamResponse(
  inputs: ResponseInput[],
  config: ResponsesConfig,
): AsyncGenerator<ManagedAgentEvent> {
  const startTime = Date.now();

  const stream = await client.responses.stream({
    model: config.model,
    input: inputs.map(i => ({
      role: i.role,
      content: i.content,
    })),
    temperature: config.temperature ?? 0.7,
    max_output_tokens: config.max_tokens,
    tools: config.tools,
    ...(config.previousResponseId && { previous_response_id: config.previousResponseId }),
  });

  let responseId: string | null = null;
  let fullText = "";
  let toolCalls: Array<{ name: string; args: string }> = [];

  yield {
    type: "step",
    timestamp: Date.now(),
    status: "running",
    content: "Response started",
  };

  for await (const event of stream) {
    switch (event.type) {
      case "response.created":
        responseId = event.response.id;
        yield {
          type: "step",
          timestamp: Date.now(),
          status: "running",
          content: `Response ${responseId} created`,
        };
        break;

      case "response.output_item.added":
        if (event.item.type === "message") {
          yield {
            type: "step",
            timestamp: Date.now(),
            status: "running",
            content: "Generating message...",
          };
        }
        if (event.item.type === "function_call") {
          toolCalls.push({
            name: event.item.name ?? "unknown",
            args: event.item.arguments ?? "{}",
          });
          yield {
            type: "tool_call" as const,
            timestamp: Date.now(),
            tool: event.item.name ?? "unknown",
            status: "running",
            content: event.item.arguments,
          };
        }
        break;

      case "response.output_text.delta":
        const delta = event.delta;
        fullText += delta;
        yield {
          type: "message",
          timestamp: Date.now(),
          delta,
          status: "running",
        };
        break;

      case "response.completed":
        const usage = event.response.usage;
        const costUsd = usage
          ? calculateCost(usage.input_tokens, usage.output_tokens, config.model)
          : 0;

        yield {
          type: "message",
          timestamp: Date.now(),
          content: fullText,
          status: "done",
        };

        yield {
          type: "step",
          timestamp: Date.now(),
          status: "done",
          content: "Response completed",
          usage: usage
            ? {
                tokensIn: usage.input_tokens,
                tokensOut: usage.output_tokens,
                costUsd,
              }
            : undefined,
        };

        // Marquer comme terminé
        yield {
          type: "idle",
          timestamp: Date.now(),
          content: fullText,
          usage: usage
            ? {
                tokensIn: usage.input_tokens,
                tokensOut: usage.output_tokens,
                costUsd,
              }
            : undefined,
        };
        break;

      case "error":
        yield {
          type: "error",
          timestamp: Date.now(),
          error: "Streaming error occurred",
        };
        break;
    }
  }
}

// ── Session-like Interface ─────────────────────────────────

/**
 * Maintient un contexte conversationnel simple.
 * Contrairement à Assistants, c'est géré côté client (previous_response_id).
 */
export class ResponsesSession {
  private model: string;
  private temperature: number;
  private maxTokens?: number;
  private previousResponseId: string | null = null;
  private history: ResponseInput[] = [];

  constructor(
    model: string = "gpt-4o-mini",
    temperature: number = 0.7,
    maxTokens?: number,
  ) {
    this.model = model;
    this.temperature = temperature;
    this.maxTokens = maxTokens;
  }

  /**
   * Ajoute un message à l'historique.
   */
  addMessage(role: "user" | "assistant", content: string): void {
    this.history.push({ role, content });
  }

  /**
   * Génère une réponse en utilisant l'historique.
   */
  async send(message: string): Promise<{
    text: string;
    responseId: string;
    costUsd: number;
  }> {
    // Ajouter le message utilisateur
    this.addMessage("user", message);

    // Préparer les inputs (derniers 10 messages pour limiter le contexte)
    const inputs = this.history.slice(-10);

    // Générer la réponse
    const response = await generateResponse(inputs, {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      previousResponseId: this.previousResponseId ?? undefined,
    });

    // Sauvegarder l'ID pour la continuité
    this.previousResponseId = response.id;

    // Ajouter la réponse à l'historique
    this.addMessage("assistant", response.text);

    return {
      text: response.text,
      responseId: response.id,
      costUsd: response.costUsd,
    };
  }

  /**
   * Streaming version.
   */
  async *sendStream(message: string): AsyncGenerator<ManagedAgentEvent> {
    this.addMessage("user", message);
    const inputs = this.history.slice(-10);

    let responseText = "";

    for await (const event of streamResponse(inputs, {
      model: this.model,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    })) {
      yield event;

      if (event.type === "message" && event.content) {
        responseText = event.content;
      }
    }

    this.addMessage("assistant", responseText);
  }

  getHistory(): ResponseInput[] {
    return [...this.history];
  }

  clear(): void {
    this.history = [];
    this.previousResponseId = null;
  }
}

// ── Quick Helpers ──────────────────────────────────────────

/**
 * Réponse rapide en une ligne.
 */
export async function quickResponse(
  prompt: string,
  model: string = "gpt-4o-mini",
): Promise<string> {
  const response = await generateResponse(
    [{ role: "user", content: prompt }],
    { model },
  );
  return response.text;
}

/**
 * Streaming rapide.
 */
export async function* quickStream(
  prompt: string,
  model: string = "gpt-4o-mini",
): AsyncGenerator<string> {
  for await (const event of streamResponse(
    [{ role: "user", content: prompt }],
    { model },
  )) {
    if (event.type === "message" && event.delta) {
      yield event.delta;
    }
  }
}

// ── Utilities ───────────────────────────────────────────────

function calculateCost(tokensIn: number, tokensOut: number, model: string): number {
  const pricing: Record<string, { in: number; out: number }> = {
    "gpt-4o": { in: 2.5, out: 10 },
    "gpt-4o-mini": { in: 0.15, out: 0.6 },
    "gpt-4-turbo": { in: 10, out: 30 },
    "gpt-4": { in: 30, out: 60 },
    "o1": { in: 15, out: 60 },
    "o3-mini": { in: 1.1, out: 4.4 },
  };

  const p = pricing[model] ?? { in: 2.5, out: 10 };
  return (tokensIn * p.in + tokensOut * p.out) / 1_000_000;
}

// ── Tests ───────────────────────────────────────────────────

export async function testResponsesBackend(): Promise<{
  ok: boolean;
  response?: string;
  costUsd?: number;
  error?: string;
}> {
  try {
    const result = await generateResponse(
      [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Say 'Hello from Responses API' in one word." },
      ],
      { model: "gpt-4o-mini" },
    );

    return {
      ok: result.text.toLowerCase().includes("hello"),
      response: result.text,
      costUsd: result.costUsd,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Test failed",
    };
  }
}

export async function testResponsesSession(): Promise<{
  ok: boolean;
  conversation?: string[];
  totalCost?: number;
  error?: string;
}> {
  try {
    const session = new ResponsesSession("gpt-4o-mini");
    const conversation: string[] = [];
    let totalCost = 0;

    // Premier message
    const r1 = await session.send("What is 2+2? Answer with just the number.");
    conversation.push(`User: What is 2+2?`);
    conversation.push(`Assistant: ${r1.text}`);
    totalCost += r1.costUsd;

    // Deuxième message (doit se souvenir du contexte)
    const r2 = await session.send("Multiply that by 3.");
    conversation.push(`User: Multiply that by 3.`);
    conversation.push(`Assistant: ${r2.text}`);
    totalCost += r2.costUsd;

    return {
      ok: r1.text.includes("4") && r2.text.includes("12"),
      conversation,
      totalCost,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Test failed",
    };
  }
}
