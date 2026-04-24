/**
 * Session Manager — Types unifiés pour toutes les sessions
 *
 * Interface commune pour tous les backends (OpenAI, Anthropic, etc.)
 */

import type { AgentBackendV2 } from "../backend-v2/types";
import type { ManagedAgentEvent } from "../backend-v2/types";

// ── Core Types ──────────────────────────────────────────────

export interface SessionMessage {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface SessionResponse {
  message: SessionMessage;
  usage?: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
  };
  events?: ManagedAgentEvent[];
}

export interface SessionState {
  id: string;
  backend: AgentBackendV2;
  messages: SessionMessage[];
  metadata: Record<string, unknown>;
  createdAt: number;
  updatedAt: number;
}

export interface SessionMetrics {
  messageCount: number;
  totalTokensIn: number;
  totalTokensOut: number;
  totalCostUsd: number;
  avgLatencyMs: number;
  startTime: number;
  lastActivity: number;
}

export interface SessionConfig {
  backend: AgentBackendV2;
  /** Model to use (backend-specific) */
  model?: string;
  /** System prompt/instructions */
  systemPrompt?: string;
  /** Temperature (0-2) */
  temperature?: number;
  /** Max tokens per response */
  maxTokens?: number;
  /** Max messages to keep in context */
  maxHistoryLength?: number;
  /** Enable streaming responses */
  streaming?: boolean;
  /** Custom metadata */
  metadata?: Record<string, unknown>;
  /** Tenant/workspace context */
  tenantId?: string;
  workspaceId?: string;
  userId?: string;
  /** Initial history to seed the session (for continuity) */
  initialHistory?: Array<{ role: "user" | "assistant"; content: string }>;
}

// ── Unified Session Interface ────────────────────────────────

export interface UnifiedSession {
  /** Unique session identifier */
  readonly id: string;
  /** Backend type */
  readonly backend: AgentBackendV2;
  /** Session configuration */
  readonly config: SessionConfig;
  /** Session status */
  readonly status: "created" | "active" | "paused" | "closed" | "error";

  // ── Core Methods ─────────────────────────────────────────

  /**
   * Send a message and get a response.
   * Blocking/simple version.
   */
  send(message: string): Promise<SessionResponse>;

  /**
   * Send a message with streaming.
   * Returns an async generator of events.
   */
  sendStream(message: string): AsyncGenerator<ManagedAgentEvent>;

  /**
   * Get message history.
   */
  getHistory(): Promise<SessionMessage[]>;

  /**
   * Clear message history.
   */
  clearHistory(): Promise<void>;

  /**
   * Close the session and cleanup resources.
   */
  close(): Promise<void>;

  // ── Advanced Methods ────────────────────────────────────

  /**
   * Handoff this session to another backend.
   * Transfers conversation context.
   */
  handoff(toBackend: AgentBackendV2, config?: Partial<SessionConfig>): Promise<UnifiedSession>;

  /**
   * Persist session state for later resumption.
   */
  persist(): Promise<SessionState>;

  /**
   * Update session config (may recreate underlying resources).
   */
  updateConfig(config: Partial<SessionConfig>): Promise<void>;

  // ── Metrics & Observability ────────────────────────────

  /**
   * Get session metrics.
   */
  getMetrics(): SessionMetrics;

  /**
   * Get current token count (approximate).
   */
  getTokenCount(): number;

  /**
   * Check if session is healthy.
   */
  healthCheck(): Promise<{ healthy: boolean; error?: string }>;
}

// ── Session Manager Types ───────────────────────────────────

export interface SessionManagerConfig {
  /** Default backend for new sessions */
  defaultBackend?: AgentBackendV2;
  /** Enable automatic backend selection */
  autoSelectBackend?: boolean;
  /** Max sessions per user */
  maxSessionsPerUser?: number;
  /** Session timeout in ms */
  sessionTimeoutMs?: number;
  /** Enable session persistence to database */
  enablePersistence?: boolean;
  /** Callback for session events */
  onSessionEvent?: (event: SessionManagerEvent) => void;
}

export interface SessionManagerEvent {
  type: "session_created" | "session_closed" | "handoff" | "error" | "metrics";
  sessionId: string;
  backend?: AgentBackendV2;
  timestamp: number;
  details?: Record<string, unknown>;
}

export interface HandoffResult {
  fromSession: UnifiedSession;
  toSession: UnifiedSession;
  success: boolean;
  transferredMessages: number;
  error?: string;
}

// ── Storage Types (for persistence) ────────────────────────

export interface SessionStorage {
  save(state: SessionState): Promise<void>;
  load(sessionId: string): Promise<SessionState | null>;
  list(options?: { tenantId?: string; userId?: string; limit?: number }): Promise<SessionState[]>;
  delete(sessionId: string): Promise<void>;
}

// ── Factory Types ───────────────────────────────────────────

export type SessionFactory = (config: SessionConfig) => Promise<UnifiedSession>;

export interface BackendSessionRegistry {
  [backendId: string]: SessionFactory;
}
