/**
 * Unified Session Manager — Barrel export.
 *
 * Cross-provider session management with handoff capabilities.
 */

export type {
  Session,
  SessionState,
  SessionStore,
  SessionManager,
  SessionManagerEvent,
  SessionManagerEventType,
  SessionEventHandler,
  SessionMetrics,
} from "./types";

// Implementation exports (to be implemented)
// export { createSessionManager } from "./manager";
// export { SupabaseSessionStore } from "./supabase-store";
// export { MemorySessionStore } from "./memory-store";
