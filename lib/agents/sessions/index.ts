/**
 * Sessions Module — Unified Session Management
 *
 * One interface for all AI backends.
 */

// ── Types ───────────────────────────────────────────────────

export type {
  SessionMessage,
  SessionResponse,
  SessionState,
  SessionMetrics,
  SessionConfig,
  UnifiedSession,
  SessionManagerConfig,
  SessionManagerEvent,
  HandoffResult,
  SessionStorage,
  SessionFactory,
  BackendSessionRegistry,
} from "./types";

// ── Base Class ─────────────────────────────────────────────

export { BaseSession } from "./base-session";

// ── Backend Implementations ─────────────────────────────────

export { OpenAIAssistantSession } from "./openai-assistant-session";
export { OpenAIResponsesSession } from "./openai-responses-session";
export { OpenAIComputerSession, type ScreenshotProvider } from "./openai-computer-session";
export { AnthropicSession } from "./anthropic-session";

// ── Session Manager ───────────────────────────────────────

export {
  SessionManager,
  createSession,
  getAllSessionMetrics,
  closeAllSessions,
} from "./manager";
