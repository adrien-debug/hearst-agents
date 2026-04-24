/**
 * Anthropic Session
 *
 * Wrapper pour les sessions Anthropic (Claude).
 * Stub implementation - full implementation pending Anthropic SDK setup.
 */

import { BaseSession } from "./base-session";
import type { SessionConfig, SessionResponse, SessionState } from "./types";
import type { ManagedAgentEvent, AgentBackendV2 } from "../backend-v2/types";

export class AnthropicSession extends BaseSession {
  private sessionId?: string;

  constructor(config: SessionConfig) {
    super("anthropic_sessions", config);
  }

  async initialize(): Promise<void> {
    // Placeholder - Anthropic SDK initialization
    // TODO: Implement when Anthropic SDK is added
    this.sessionId = `anthropic_${Date.now()}`;
    this.status = "created";
  }

  async sendInternal(message: string): Promise<SessionResponse> {
    // Placeholder implementation
    const responseMsg = this.createAssistantMessage(
      `[Anthropic Session Stub] Received: ${message}`,
    );

    return {
      message: responseMsg,
      usage: {
        tokensIn: message.length / 4,
        tokensOut: 50,
        costUsd: 0.003,
      },
    };
  }

  async *sendStreamInternal(message: string): AsyncGenerator<ManagedAgentEvent> {
    yield {
      type: "step",
      timestamp: Date.now(),
      status: "running",
      content: "Connecting to Anthropic...",
    };

    yield {
      type: "message",
      timestamp: Date.now(),
      delta: "[Anthropic Session Stub] ",
      status: "running",
    };

    yield {
      type: "message",
      timestamp: Date.now(),
      content: `[Anthropic Session Stub] Received: ${message}`,
      status: "done",
    };

    yield {
      type: "idle",
      timestamp: Date.now(),
      content: `[Anthropic Session Stub] Received: ${message}`,
      usage: {
        tokensIn: message.length / 4,
        tokensOut: 50,
        costUsd: 0.003,
      },
    };
  }

  async closeInternal(): Promise<void> {
    this.sessionId = undefined;
  }

  async handoffInternal(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<BaseSession> {
    const { OpenAIAssistantSession } = await import("./openai-assistant-session");
    const { OpenAIResponsesSession } = await import("./openai-responses-session");
    const { OpenAIComputerSession } = await import("./openai-computer-session");

    const newConfig = { ...this.config, ...config };

    switch (toBackend) {
      case "openai_assistants": {
        const session = new OpenAIAssistantSession(newConfig);
        await session.initialize();
        return session;
      }
      case "openai_responses": {
        const session = new OpenAIResponsesSession(newConfig);
        await session.initialize();
        return session;
      }
      case "openai_computer_use": {
        const session = new OpenAIComputerSession(newConfig);
        await session.initialize();
        return session;
      }
      default:
        throw new Error(`Handoff from anthropic_sessions to ${toBackend} not supported`);
    }
  }

  async getTokenCountInternal(): Promise<number> {
    return this.tokenCount;
  }

  async healthCheckInternal(): Promise<{ healthy: boolean; error?: string }> {
    // Check if ANTHROPIC_API_KEY is set
    if (!process.env.ANTHROPIC_API_KEY) {
      return { healthy: false, error: "ANTHROPIC_API_KEY not set" };
    }
    return { healthy: true };
  }

  async persist(): Promise<SessionState> {
    const state = await super.persist();
    state.metadata = {
      ...state.metadata,
      anthropicSessionId: this.sessionId,
    };
    return state;
  }

  // ── Anthropic-specific Methods ──────────────────────────────

  getAnthropicSessionId(): string | undefined {
    return this.sessionId;
  }
}
