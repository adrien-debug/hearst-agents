/**
 * OpenAI Responses Session
 *
 * Wrapper pour l'API Responses (stateless, gère l'historique côté client).
 */

import { BaseSession } from "./base-session";
import type { SessionConfig, SessionResponse, SessionMessage, SessionState } from "./types";
import type { AgentBackendV2, ManagedAgentEvent } from "../backend-v2/types";
import { generateResponse, streamResponse } from "../backend-v2/openai-responses";

export class OpenAIResponsesSession extends BaseSession {
  private previousResponseId?: string;

  constructor(config: SessionConfig) {
    super("openai_responses", config);
  }

  async initialize(): Promise<void> {
    // No initialization needed for stateless Responses API
    this.status = "created";
  }

  async sendInternal(message: string): Promise<SessionResponse> {
    // Build input from history
    const inputs = this.buildInputs();

    // Generate response
    const result = await generateResponse(inputs, {
      model: this.config.model ?? "gpt-4o-mini",
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      previousResponseId: this.previousResponseId,
    });

    // Save response ID for continuity
    this.previousResponseId = result.id;

    const responseMsg = this.createAssistantMessage(result.text);

    return {
      message: responseMsg,
      usage: {
        tokensIn: result.usage.input_tokens,
        tokensOut: result.usage.output_tokens,
        costUsd: result.costUsd,
      },
    };
  }

  async *sendStreamInternal(message: string): AsyncGenerator<ManagedAgentEvent> {
    // Build input from history
    const inputs = this.buildInputs();

    // Stream response
    for await (const event of streamResponse(inputs, {
      model: this.config.model ?? "gpt-4o-mini",
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      previousResponseId: this.previousResponseId,
    })) {
      yield event;

      // Track response ID from completion event
      if (event.type === "idle" && event.usage) {
        // Response ID is not directly exposed in events
        // But that's OK, we'll use previousResponseId on next call
      }
    }
  }

  async closeInternal(): Promise<void> {
    // Nothing to close for stateless API
    this.previousResponseId = undefined;
  }

  async handoffInternal(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<BaseSession> {
    const { OpenAIAssistantSession } = await import("./openai-assistant-session");
    const { OpenAIComputerSession } = await import("./openai-computer-session");
    const { AnthropicSession } = await import("./anthropic-session");

    const newConfig = { ...this.config, ...config };

    switch (toBackend) {
      case "openai_assistants": {
        const session = new OpenAIAssistantSession(newConfig);
        await session.initialize();
        return session;
      }
      case "openai_computer_use": {
        const session = new OpenAIComputerSession(newConfig);
        await session.initialize();
        return session;
      }
      case "anthropic_sessions": {
        const session = new AnthropicSession(newConfig);
        await session.initialize();
        return session;
      }
      default:
        throw new Error(`Handoff from openai_responses to ${toBackend} not supported`);
    }
  }

  async getTokenCountInternal(): Promise<number> {
    return this.tokenCount;
  }

  async healthCheckInternal(): Promise<{ healthy: boolean; error?: string }> {
    // Simple health check - try to make a minimal request
    try {
      await generateResponse(
        [{ role: "user", content: "Hi" }],
        { model: "gpt-4o-mini", max_tokens: 5 },
      );
      return { healthy: true };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : "API health check failed",
      };
    }
  }

  async persist(): Promise<SessionState> {
    const state = await super.persist();
    state.metadata = {
      ...state.metadata,
      previousResponseId: this.previousResponseId,
    };
    return state;
  }

  // ── Responses-specific Methods ──────────────────────────────

  getPreviousResponseId(): string | undefined {
    return this.previousResponseId;
  }

  // ── Private Helpers ───────────────────────────────────────

  private buildInputs(): Array<{ role: "system" | "user" | "assistant"; content: string }> {
    const inputs: Array<{ role: "system" | "user" | "assistant"; content: string }> = [];

    // Add system prompt if exists
    if (this.config.systemPrompt) {
      inputs.push({ role: "system", content: this.config.systemPrompt });
    }

    // Add history
    for (const msg of this.messages) {
      if (msg.role === "system") {
        inputs.push({ role: "system", content: msg.content });
      } else if (msg.role === "user") {
        inputs.push({ role: "user", content: msg.content });
      } else if (msg.role === "assistant") {
        inputs.push({ role: "assistant", content: msg.content });
      }
      // Skip tool messages for Responses API
    }

    return inputs;
  }
}
