/**
 * Session Manager — Factory et gestionnaire de sessions unifiées
 *
 * Crée et gère des sessions pour tous les backends de manière uniforme.
 */

import { randomUUID } from "crypto";
import type {
  AgentBackendV2,
  BackendSelectionInput,
} from "../backend-v2/types";
import { selectBackend } from "../backend-v2/selector";
import type {
  UnifiedSession,
  SessionConfig,
  SessionState,
  SessionManagerConfig,
  SessionManagerEvent,
  SessionStorage,
  HandoffResult,
  BackendSessionRegistry,
} from "./types";
import { OpenAIAssistantSession } from "./openai-assistant-session";
import { OpenAIResponsesSession } from "./openai-responses-session";
import { OpenAIComputerSession } from "./openai-computer-session";
import { AnthropicSession } from "./anthropic-session";

// ── Session Manager ─────────────────────────────────────────

export class SessionManager {
  private static instance: SessionManager;
  private sessions: Map<string, UnifiedSession> = new Map();
  private config: SessionManagerConfig;
  private storage?: SessionStorage;
  private factories: BackendSessionRegistry;

  private constructor(config: SessionManagerConfig = {}, storage?: SessionStorage) {
    this.config = {
      defaultBackend: "openai_responses",
      autoSelectBackend: true,
      maxSessionsPerUser: 10,
      sessionTimeoutMs: 30 * 60 * 1000, // 30 minutes
      enablePersistence: false,
      ...config,
    };
    this.storage = storage;
    this.factories = this.initializeFactories();
  }

  /**
   * Get or create the singleton instance.
   */
  static getInstance(config?: SessionManagerConfig, storage?: SessionStorage): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager(config, storage);
    }
    return SessionManager.instance;
  }

  /**
   * Reset the singleton (useful for testing).
   */
  static reset(): void {
    SessionManager.instance = undefined as unknown as SessionManager;
  }

  // ── Factory Initialization ────────────────────────────────

  private initializeFactories(): BackendSessionRegistry {
    return {
      openai_assistants: async (config) => {
        const session = new OpenAIAssistantSession(config);
        await session.initialize();
        return session;
      },
      openai_responses: async (config) => {
        const session = new OpenAIResponsesSession(config);
        await session.initialize();
        return session;
      },
      openai_computer_use: async (config) => {
        const session = new OpenAIComputerSession(config);
        await session.initialize();
        return session;
      },
      anthropic_sessions: async (config) => {
        const session = new AnthropicSession(config);
        await session.initialize();
        return session;
      },
      // Fallback for unsupported backends
      hearst_runtime: async (config) => {
        throw new Error("hearst_runtime does not support managed sessions. Use RuntimeEngine directly.");
      },
      hybrid: async (config) => {
        // For hybrid, auto-select the best backend
        const selection = selectBackend({ prompt: config.systemPrompt || "", context: "" });
        const factory = this.factories[selection.selectedBackend];
        if (!factory) {
          throw new Error(`No factory for selected backend: ${selection.selectedBackend}`);
        }
        return factory(config);
      },
    };
  }

  // ── Session Creation ────────────────────────────────────

  /**
   * Create a new session with automatic backend selection.
   */
  async create(
    prompt: string,
    userConfig?: Partial<SessionConfig>,
  ): Promise<UnifiedSession> {
    const startTime = Date.now();

    // Determine backend
    let backend: AgentBackendV2;
    if (userConfig?.backend) {
      backend = userConfig.backend;
    } else if (this.config.autoSelectBackend) {
      const selection = selectBackend({ prompt, context: "" });
      backend = selection.selectedBackend;
    } else {
      backend = this.config.defaultBackend ?? "openai_responses";
    }

    // Check limits
    if (userConfig?.userId) {
      const userSessions = this.getUserSessions(userConfig.userId);
      if (userSessions.length >= (this.config.maxSessionsPerUser ?? 10)) {
        throw new Error(`Maximum sessions (${this.config.maxSessionsPerUser}) reached for user ${userConfig.userId}`);
      }
    }

    // Create config
    const config: SessionConfig = {
      backend,
      model: userConfig?.model,
      systemPrompt: userConfig?.systemPrompt,
      temperature: userConfig?.temperature ?? 0.7,
      maxTokens: userConfig?.maxTokens,
      maxHistoryLength: userConfig?.maxHistoryLength ?? 50,
      streaming: userConfig?.streaming ?? true,
      metadata: userConfig?.metadata,
      tenantId: userConfig?.tenantId,
      workspaceId: userConfig?.workspaceId,
      userId: userConfig?.userId,
    };

    // Create session
    const factory = this.factories[backend];
    if (!factory) {
      throw new Error(`No factory for backend: ${backend}`);
    }

    const session = await factory(config);
    this.sessions.set(session.id, session);

    // Emit event
    this.emitEvent({
      type: "session_created",
      sessionId: session.id,
      backend,
      timestamp: Date.now(),
      details: { config, selectionTimeMs: Date.now() - startTime },
    });

    // Persist if enabled
    if (this.config.enablePersistence && this.storage) {
      const state = await session.persist();
      await this.storage.save(state);
    }

    return session;
  }

  /**
   * Create a session with a specific backend (bypass auto-selection).
   */
  async createWithBackend(
    backend: AgentBackendV2,
    config?: Partial<SessionConfig>,
  ): Promise<UnifiedSession> {
    return this.create("", { ...config, backend });
  }

  /**
   * Resume a session from persisted state.
   */
  async resume(sessionId: string): Promise<UnifiedSession | null> {
    // Check if already loaded
    const existing = this.sessions.get(sessionId);
    if (existing) return existing;

    // Load from storage
    if (!this.storage) return null;

    const state = await this.storage.load(sessionId);
    if (!state) return null;

    // Recreate session
    const factory = this.factories[state.backend];
    if (!factory) return null;

    const config: SessionConfig = {
      backend: state.backend,
      metadata: state.metadata,
    };

    const session = await factory(config);
    // Restore history
    for (const msg of state.messages) {
      // This is a simplification - real implementation would need
      // backend-specific restoration logic
    }

    this.sessions.set(session.id, session);
    return session;
  }

  // ── Session Management ──────────────────────────────────

  /**
   * Get a session by ID.
   */
  get(sessionId: string): UnifiedSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all active sessions.
   */
  list(): UnifiedSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * List sessions for a specific user.
   */
  getUserSessions(userId: string): UnifiedSession[] {
    return this.list().filter(s => s.config.userId === userId);
  }

  /**
   * Close and remove a session.
   */
  async close(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    await session.close();
    this.sessions.delete(sessionId);

    // Delete from storage
    if (this.storage) {
      await this.storage.delete(sessionId);
    }

    this.emitEvent({
      type: "session_closed",
      sessionId,
      backend: session.backend,
      timestamp: Date.now(),
    });

    return true;
  }

  /**
   * Close all sessions.
   */
  async closeAll(): Promise<void> {
    const promises = Array.from(this.sessions.keys()).map(id => this.close(id));
    await Promise.all(promises);
  }

  // ── Handoff ───────────────────────────────────────────────

  /**
   * Handoff a session to another backend.
   */
  async handoff(
    sessionId: string,
    toBackend: AgentBackendV2,
    config?: Partial<SessionConfig>,
  ): Promise<HandoffResult> {
    const fromSession = this.sessions.get(sessionId);
    if (!fromSession) {
      throw new Error(`Session not found: ${sessionId}`);
    }

    const startTime = Date.now();
    const history = await fromSession.getHistory();

    // Create new session with transferred context
    const newSession = await fromSession.handoff(toBackend, config);
    this.sessions.set(newSession.id, newSession);

    // Close old session
    await this.close(sessionId);

    const result: HandoffResult = {
      fromSession,
      toSession: newSession,
      success: true,
      transferredMessages: history.length,
    };

    this.emitEvent({
      type: "handoff",
      sessionId: newSession.id,
      backend: toBackend,
      timestamp: Date.now(),
      details: {
        fromBackend: fromSession.backend,
        toBackend,
        durationMs: Date.now() - startTime,
        transferredMessages: history.length,
      },
    });

    return result;
  }

  // ── Metrics & Health ──────────────────────────────────────

  /**
   * Get metrics for all sessions.
   */
  getMetrics(): Array<{ sessionId: string; backend: AgentBackendV2; metrics: unknown }> {
    return this.list().map(s => ({
      sessionId: s.id,
      backend: s.backend,
      metrics: s.getMetrics(),
    }));
  }

  /**
   * Health check all sessions.
   */
  async healthCheck(): Promise<Array<{ sessionId: string; healthy: boolean; error?: string }>> {
    const results = await Promise.all(
      this.list().map(async s => {
        const result = await s.healthCheck();
        return {
          sessionId: s.id,
          healthy: result.healthy,
          error: result.error,
        };
      }),
    );

    // Emit events for unhealthy sessions
    results
      .filter(r => !r.healthy)
      .forEach(r => {
        this.emitEvent({
          type: "error",
          sessionId: r.sessionId,
          timestamp: Date.now(),
          details: { error: r.error },
        });
      });

    return results;
  }

  // ── Private Methods ───────────────────────────────────────

  private emitEvent(event: SessionManagerEvent): void {
    this.config.onSessionEvent?.(event);
  }
}

// ── Convenience Functions ─────────────────────────────────

/**
 * Quick create a session.
 */
export async function createSession(
  prompt: string,
  config?: Partial<SessionConfig>,
): Promise<UnifiedSession> {
  return SessionManager.getInstance().create(prompt, config);
}

/**
 * Get global metrics.
 */
export function getAllSessionMetrics(): Array<{ sessionId: string; backend: AgentBackendV2; metrics: unknown }> {
  return SessionManager.getInstance().getMetrics();
}

/**
 * Close all sessions (cleanup).
 */
export async function closeAllSessions(): Promise<void> {
  return SessionManager.getInstance().closeAll();
}
