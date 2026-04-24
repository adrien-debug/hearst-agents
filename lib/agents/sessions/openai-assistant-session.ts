/**
 * OpenAI Assistant Session
 *
 * Wrapper pour les threads OpenAI Assistants API.
 */

import { BaseSession } from "./base-session";
import type { SessionConfig, SessionResponse, SessionState } from "./types";
import type { ManagedAgentEvent, AgentBackendV2 } from "../backend-v2/types";
import {
  createOrGetAssistant,
  createThread,
  addMessageToThread,
  runAssistant,
  streamRun,
} from "../backend-v2/openai-assistant";

export class OpenAIAssistantSession extends BaseSession {
  private threadId?: string;
  private assistantId?: string;
  private runId?: string;

  constructor(config: SessionConfig) {
    super("openai_assistants", config);
  }

  async initialize(): Promise<void> {
    // Create assistant with system prompt
    this.assistantId = await createOrGetAssistant({
      model: this.config.model ?? "gpt-4o-mini",
      name: "Hearst Assistant",
      instructions: this.config.systemPrompt,
    });

    // Create thread
    this.threadId = await createThread();

    // Seed with initial history if provided (for continuity)
    if (this.config.initialHistory && this.config.initialHistory.length > 0) {
      for (const msg of this.config.initialHistory) {
        await addMessageToThread(this.threadId, { role: msg.role, content: msg.content });
      }
      console.log(`[OpenAIAssistantSession] Seeded thread with ${this.config.initialHistory.length} messages`);
    }

    this.status = "created";
  }

  async sendInternal(message: string): Promise<SessionResponse> {
    if (!this.threadId || !this.assistantId) {
      throw new Error("Session not initialized");
    }

    // Add message to thread
    await addMessageToThread(this.threadId, { role: "user", content: message });

    // Run assistant
    const result = await runAssistant(this.threadId, this.assistantId);
    this.runId = result.runId;

    // Get assistant response from last message
    const lastMessage = result.messages
      .filter(m => m.role === "assistant")
      .pop();

    const content = lastMessage?.content
      .map(c => c.type === "text" ? c.text.value : "")
      .join("") ?? "No response";

    const responseMsg = this.createAssistantMessage(content);

    return {
      message: responseMsg,
      usage: result.usage
        ? {
            tokensIn: result.usage.prompt_tokens,
            tokensOut: result.usage.completion_tokens,
            costUsd: (result.usage.prompt_tokens * 2.5 + result.usage.completion_tokens * 10) / 1_000_000, // GPT-4o pricing
          }
        : undefined,
    };
  }

  async *sendStreamInternal(message: string): AsyncGenerator<ManagedAgentEvent> {
    if (!this.threadId || !this.assistantId) {
      throw new Error("Session not initialized");
    }

    // Add message to thread
    await addMessageToThread(this.threadId, { role: "user", content: message });

    // Stream the run
    for await (const event of streamRun(this.threadId, this.assistantId)) {
      yield event;
    }
  }

  async closeInternal(): Promise<void> {
    // Threads persist on OpenAI's side, nothing to close
    this.threadId = undefined;
    this.assistantId = undefined;
    this.runId = undefined;
  }

  async handoffInternal(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<BaseSession> {
    const { OpenAIResponsesSession } = await import("./openai-responses-session");
    const { OpenAIComputerSession } = await import("./openai-computer-session");
    const { AnthropicSession } = await import("./anthropic-session");

    const newConfig = { ...this.config, ...config };

    switch (toBackend) {
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
      case "anthropic_sessions": {
        const session = new AnthropicSession(newConfig);
        await session.initialize();
        return session;
      }
      default:
        throw new Error(`Handoff from openai_assistants to ${toBackend} not supported`);
    }
  }

  async getTokenCountInternal(): Promise<number> {
    // OpenAI doesn't expose thread token count directly
    // We track it locally
    return this.tokenCount;
  }

  async healthCheckInternal(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.threadId) {
      return { healthy: false, error: "Thread not created" };
    }
    if (!this.assistantId) {
      return { healthy: false, error: "Assistant not created" };
    }
    return { healthy: true };
  }

  async persist(): Promise<SessionState> {
    const state = await super.persist();
    state.metadata = {
      ...state.metadata,
      threadId: this.threadId,
      assistantId: this.assistantId,
      runId: this.runId,
    };
    return state;
  }

  // ── Assistant-specific Methods ──────────────────────────────

  getThreadId(): string | undefined {
    return this.threadId;
  }

  getAssistantId(): string | undefined {
    return this.assistantId;
  }

  getRunId(): string | undefined {
    return this.runId;
  }
}
