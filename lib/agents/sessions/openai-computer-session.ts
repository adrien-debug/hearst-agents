/**
 * OpenAI Computer Use Session
 *
 * Wrapper pour l'API Computer Use (vision + contrôle UI).
 */

import { BaseSession } from "./base-session";
import type { SessionConfig, SessionResponse, SessionMessage, SessionState } from "./types";
import type { AgentBackendV2, ManagedAgentEvent } from "../backend-v2/types";
import {
  createComputerSession,
  executeComputerStep,
  encodeImageToBase64,
} from "../backend-v2/openai-computer-use";

export interface ScreenshotProvider {
  capture(): Promise<Buffer> | Buffer;
}

export class OpenAIComputerSession extends BaseSession {
  private computerSession?: ReturnType<typeof createComputerSession>;
  private screenshotProvider?: ScreenshotProvider;

  constructor(config: SessionConfig) {
    super("openai_computer_use", config);
  }

  async initialize(): Promise<void> {
    this.computerSession = createComputerSession();
    this.status = "created";
  }

  /**
   * Set the screenshot provider for this session.
   * Required before sending messages that need vision.
   */
  setScreenshotProvider(provider: ScreenshotProvider): void {
    this.screenshotProvider = provider;
  }

  async sendInternal(message: string): Promise<SessionResponse> {
    if (!this.computerSession) {
      throw new Error("Session not initialized");
    }
    if (!this.screenshotProvider) {
      throw new Error("Screenshot provider required for Computer Use. Call setScreenshotProvider() first.");
    }

    // Capture screenshot
    const screenshot = await this.screenshotProvider.capture();
    const screenshotData = encodeImageToBase64(screenshot);

    // Execute step
    const result = await executeComputerStep(
      this.computerSession,
      screenshotData,
      message,
      {
        model: this.config.model ?? "computer-use-preview",
        environment: "browser",
      },
    );

    const content = result.done
      ? (result.reasoning ?? "Task completed")
      : (result.action
        ? `[Action: ${result.action.type}] ${result.action.text ?? ""}`
        : "Processing...");

    const responseMsg = this.createAssistantMessage(content);

    return {
      message: responseMsg,
      usage: result.usage
        ? {
            tokensIn: result.usage.inputTokens,
            tokensOut: result.usage.outputTokens,
            costUsd: result.usage.costUsd,
          }
        : undefined,
    };
  }

  async *sendStreamInternal(message: string): AsyncGenerator<ManagedAgentEvent> {
    if (!this.computerSession) {
      throw new Error("Session not initialized");
    }
    if (!this.screenshotProvider) {
      throw new Error("Screenshot provider required");
    }

    // Single step for now - could be expanded to multi-step loop
    const screenshot = await this.screenshotProvider.capture();
    const screenshotData = encodeImageToBase64(screenshot);

    yield {
      type: "step",
      timestamp: Date.now(),
      status: "running",
      content: "Capturing screenshot and analyzing...",
    };

    const result = await executeComputerStep(
      this.computerSession,
      screenshotData,
      message,
      {
        model: this.config.model ?? "computer-use-preview",
        environment: "browser",
      },
    );

    if (result.action) {
      yield {
        type: "action",
        timestamp: Date.now(),
        action: result.action.type,
        content: JSON.stringify(result.action),
        status: "running",
      };
    }

    yield {
      type: "message",
      timestamp: Date.now(),
      content: result.reasoning ?? "Step executed",
      status: result.done ? "done" : "running",
    };

    if (result.done) {
      yield {
        type: "idle",
        timestamp: Date.now(),
        content: result.reasoning,
        usage: result.usage
          ? {
              tokensIn: result.usage.inputTokens,
              tokensOut: result.usage.outputTokens,
              costUsd: result.usage.costUsd,
            }
          : undefined,
      };
    }
  }

  async closeInternal(): Promise<void> {
    this.computerSession = undefined;
    this.screenshotProvider = undefined;
  }

  async handoffInternal(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<BaseSession> {
    const { OpenAIAssistantSession } = await import("./openai-assistant-session");
    const { OpenAIResponsesSession } = await import("./openai-responses-session");
    const { AnthropicSession } = await import("./anthropic-session");

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
      case "anthropic_sessions": {
        const session = new AnthropicSession(newConfig);
        await session.initialize();
        return session;
      }
      default:
        throw new Error(`Handoff from openai_computer_use to ${toBackend} not supported`);
    }
  }

  async getTokenCountInternal(): Promise<number> {
    return this.tokenCount;
  }

  async healthCheckInternal(): Promise<{ healthy: boolean; error?: string }> {
    if (!this.screenshotProvider) {
      return { healthy: false, error: "Screenshot provider not set" };
    }
    return { healthy: true };
  }

  async persist(): Promise<SessionState> {
    const state = await super.persist();
    state.metadata = {
      ...state.metadata,
      computerSessionId: this.computerSession?.id,
    };
    return state;
  }

  // ── Computer Use Specific Methods ───────────────────────────

  getComputerSessionId(): string | undefined {
    return this.computerSession?.id;
  }

  hasScreenshotProvider(): boolean {
    return !!this.screenshotProvider;
  }
}
