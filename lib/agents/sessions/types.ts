/**
 * Unified Session Manager — Types.
 *
 * Manages sessions across multiple agent backends with state persistence
 * and cross-provider handoff capabilities.
 */

import type {
  AgentBackendV2,
  ManagedSessionConfig,
  ManagedSessionContext,
  ManagedAgentEvent,
  ManagedAgentResult,
  HandoffContext,
  HandoffResult,
} from "../backend-v2/types";

// ── Session State ────────────────────────────────────────────

export type SessionState =
  | "pending"
  | "active"
  | "paused"
  | "handing_off"
  | "completed"
  | "failed"
  | "expired";

export interface Session {
  id: string;
  runId: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  state: SessionState;
  currentBackend: AgentBackendV2;
  backendsUsed: AgentBackendV2[];
  context: ManagedSessionContext;
  config: ManagedSessionConfig;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  events: ManagedAgentEvent[];
  metadata: Record<string, unknown>;
}

// ── Session Store Interface ─────────────────────────────────

export interface SessionStore {
  save(session: Session): Promise<void>;
  load(sessionId: string): Promise<Session | null>;
  loadByRunId(runId: string): Promise<Session | null>;
  update(sessionId: string, patch: Partial<Session>): Promise<void>;
  delete(sessionId: string): Promise<void>;
  listActive(tenantId: string): Promise<Session[]>;
  expireOldSessions(maxAgeMs: number): Promise<number>; // Returns count expired
}

// ── Session Manager API ──────────────────────────────────────

export interface SessionManager {
  /** Create a new session */
  create(config: ManagedSessionConfig): Promise<Session>;

  /** Resume an existing session */
  resume(sessionId: string): Promise<Session>;

  /** Execute a prompt in the session context */
  execute(
    sessionId: string,
    prompt: string,
    onEvent?: (event: ManagedAgentEvent) => void,
  ): Promise<ManagedAgentResult>;

  /** Execute with streaming response */
  executeStream(
    sessionId: string,
    prompt: string,
  ): AsyncGenerator<ManagedAgentEvent>;

  /** Initiate handoff to another backend */
  handoff(
    sessionId: string,
    targetBackend: AgentBackendV2,
    context: HandoffContext,
  ): Promise<HandoffResult>;

  /** Pause session (preserve state) */
  pause(sessionId: string): Promise<void>;

  /** Resume paused session */
  resumePaused(sessionId: string): Promise<Session>;

  /** Cancel active execution */
  cancel(sessionId: string): Promise<void>;

  /** Get session status */
  status(sessionId: string): Promise<Session | null>;

  /** Cleanup and delete session */
  destroy(sessionId: string): Promise<void>;
}

// ── Session Events ────────────────────────────────────────────

export type SessionManagerEventType =
  | "session_created"
  | "session_started"
  | "session_paused"
  | "session_resumed"
  | "session_handing_off"
  | "session_handoff_complete"
  | "session_completed"
  | "session_failed"
  | "session_expired"
  | "session_destroyed";

export interface SessionManagerEvent {
  type: SessionManagerEventType;
  sessionId: string;
  timestamp: number;
  backend?: AgentBackendV2;
  metadata?: Record<string, unknown>;
}

export type SessionEventHandler = (event: SessionManagerEvent) => void;

// ── Session Metrics ──────────────────────────────────────────

export interface SessionMetrics {
  sessionId: string;
  totalDurationMs: number;
  totalCostUsd: number;
  backendSwitches: number;
  stepCount: number;
  errorCount: number;
  tokenUsage: {
    input: number;
    output: number;
  };
}
