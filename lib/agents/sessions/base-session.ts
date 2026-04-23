/**
 * Base Session — Classe abstraite pour toutes les sessions
 *
 * Fournit l'implémentation commune (metrics, history, etc.)
 * Les backends spécifiques héritent et implémentent les méthodes abstraites.
 */

import { randomUUID } from "crypto";
import type {
  UnifiedSession,
  SessionConfig,
  SessionMessage,
  SessionResponse,
  SessionState,
  SessionMetrics,
} from "./types";
import type { AgentBackendV2, ManagedAgentEvent } from "../backend-v2/types";

export abstract class BaseSession implements UnifiedSession {
  readonly id: string;
  readonly backend: AgentBackendV2;
  readonly config: SessionConfig;
  status: "created" | "active" | "paused" | "closed" | "error" = "created";

  protected messages: SessionMessage[] = [];
  protected metrics: SessionMetrics;
  protected startTime: number;
  protected tokenCount = 0;

  constructor(backend: AgentBackendV2, config: SessionConfig) {
    this.id = randomUUID();
    this.backend = backend;
    this.config = config;
    this.startTime = Date.now();
    this.metrics = {
      messageCount: 0,
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalCostUsd: 0,
      avgLatencyMs: 0,
      startTime: this.startTime,
      lastActivity: this.startTime,
    };
  }

  // ── Abstract Methods (to be implemented by backends) ──────

  /** Initialize the session (create thread, etc.) */
  abstract initialize(): Promise<void>;

  /** Send a message and get response (blocking) */
  abstract sendInternal(message: string): Promise<SessionResponse>;

  /** Send a message with streaming */
  abstract sendStreamInternal(message: string): AsyncGenerator<ManagedAgentEvent>;

  /** Close backend-specific resources */
  abstract closeInternal(): Promise<void>;

  /** Handoff to another backend */
  abstract handoffInternal(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<BaseSession>;

  /** Get current token count from backend */
  abstract getTokenCountInternal(): Promise<number>;

  /** Health check */
  abstract healthCheckInternal(): Promise<{ healthy: boolean; error?: string }>;

  // ── Implemented Methods ───────────────────────────────────

  async send(message: string): Promise<SessionResponse> {
    this.ensureActive();
    const startTime = Date.now();

    // Add user message
    const userMsg: SessionMessage = {
      id: randomUUID(),
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);

    // Trim history if needed
    this.trimHistory();

    // Send to backend
    const response = await this.sendInternal(message);

    // Add assistant message
    this.messages.push(response.message);

    // Update metrics
    this.updateMetrics(response, Date.now() - startTime);

    this.status = "active";
    return response;
  }

  async *sendStream(message: string): AsyncGenerator<ManagedAgentEvent> {
    this.ensureActive();
    const startTime = Date.now();

    // Add user message
    const userMsg: SessionMessage = {
      id: randomUUID(),
      role: "user",
      content: message,
      timestamp: Date.now(),
    };
    this.messages.push(userMsg);

    // Trim history if needed
    this.trimHistory();

    // Stream from backend
    let fullContent = "";
    let tokenCount = 0;
    let costUsd = 0;

    for await (const event of this.sendStreamInternal(message)) {
      yield event;

      if (event.type === "message") {
        if (event.delta) {
          fullContent += event.delta;
        }
        if (event.content) {
          fullContent = event.content;
        }
      }

      // Capture usage from idle event (final event with metrics)
      if (event.type === "idle" && event.usage) {
        tokenCount = (event.usage.tokensIn ?? 0) + (event.usage.tokensOut ?? 0);
        costUsd = event.usage.costUsd ?? 0;
      }
    }

    // Add assistant message
    const assistantMsg: SessionMessage = {
      id: randomUUID(),
      role: "assistant",
      content: fullContent,
      timestamp: Date.now(),
    };
    this.messages.push(assistantMsg);

    // Update metrics
    this.updateMetrics(
      { message: assistantMsg, usage: { tokensIn: tokenCount / 2, tokensOut: tokenCount / 2, costUsd } },
      Date.now() - startTime,
    );

    this.status = "active";
  }

  async getHistory(): Promise<SessionMessage[]> {
    return [...this.messages];
  }

  async clearHistory(): Promise<void> {
    this.messages = [];
    this.tokenCount = 0;
  }

  async close(): Promise<void> {
    if (this.status === "closed") return;

    await this.closeInternal();
    this.status = "closed";
    this.messages = [];
  }

  async handoff(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<UnifiedSession> {
    this.ensureActive();

    if (toBackend === this.backend) {
      throw new Error(`Cannot handoff to the same backend: ${toBackend}`);
    }

    const newSession = await this.handoffInternal(toBackend, config);

    // Transfer history
    for (const msg of this.messages) {
      newSession.messages.push(msg);
    }

    // Update new session metrics with accumulated values
    newSession.metrics.totalTokensIn = this.metrics.totalTokensIn;
    newSession.metrics.totalTokensOut = this.metrics.totalTokensOut;
    newSession.metrics.totalCostUsd = this.metrics.totalCostUsd;

    return newSession;
  }

  async persist(): Promise<SessionState> {
    return {
      id: this.id,
      backend: this.backend,
      messages: await this.getHistory(),
      metadata: this.config.metadata ?? {},
      createdAt: this.startTime,
      updatedAt: Date.now(),
    };
  }

  async updateConfig(config: Partial<SessionConfig>): Promise<void> {
    Object.assign(this.config, config);
    // Some backends may need to recreate resources
    // Subclasses can override
  }

  getMetrics(): SessionMetrics {
    return { ...this.metrics };
  }

  getTokenCount(): number {
    return this.tokenCount;
  }

  async healthCheck(): Promise<{ healthy: boolean; error?: string }> {
    if (this.status === "closed") {
      return { healthy: false, error: "Session is closed" };
    }
    if (this.status === "error") {
      return { healthy: false, error: "Session is in error state" };
    }
    return this.healthCheckInternal();
  }

  // ── Protected Helpers ───────────────────────────────────

  protected ensureActive(): void {
    if (this.status === "closed") {
      throw new Error("Session is closed");
    }
    if (this.status === "error") {
      throw new Error("Session is in error state");
    }
  }

  protected trimHistory(): void {
    const maxLength = this.config.maxHistoryLength ?? 50;
    if (this.messages.length > maxLength) {
      // Keep system message if exists, then most recent messages
      const systemMessages = this.messages.filter(m => m.role === "system");
      const nonSystemMessages = this.messages.filter(m => m.role !== "system");
      const toKeep = nonSystemMessages.slice(-(maxLength - systemMessages.length));
      this.messages = [...systemMessages, ...toKeep];
    }
  }

  protected updateMetrics(response: SessionResponse, latencyMs: number): void {
    this.metrics.messageCount += 2; // User + assistant

    if (response.usage) {
      this.metrics.totalTokensIn += response.usage.tokensIn;
      this.metrics.totalTokensOut += response.usage.tokensOut;
      this.metrics.totalCostUsd += response.usage.costUsd;
      this.tokenCount += response.usage.tokensIn + response.usage.tokensOut;
    }

    // Rolling average latency
    const n = Math.floor(this.metrics.messageCount / 2);
    this.metrics.avgLatencyMs =
      (this.metrics.avgLatencyMs * (n - 1) + latencyMs) / n;

    this.metrics.lastActivity = Date.now();
  }

  protected createSystemMessage(content: string): SessionMessage {
    return {
      id: randomUUID(),
      role: "system",
      content,
      timestamp: Date.now(),
    };
  }

  protected createAssistantMessage(content: string): SessionMessage {
    return {
      id: randomUUID(),
      role: "assistant",
      content,
      timestamp: Date.now(),
    };
  }
}
