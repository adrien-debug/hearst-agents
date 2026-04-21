/**
 * Thread Memory — maps threadId to conversation context.
 *
 * This is the bridge between sidebar threads (UI memory) and backend
 * conversation state (memory/store). It also holds per-thread chat snapshots
 * for instant restoration on thread switch.
 *
 * Ownership:
 * - threadId ↔ conversationId mapping: this module
 * - backend conversation memory: lib/memory/store.ts
 * - sidebar thread list: app/lib/sidebar-state.ts
 * - surface/panel state: app/lib/surface-state.ts
 *
 * Guardrails:
 * - Do NOT replay messages on restore (swap the array, don't push one-by-one)
 * - Do NOT clear chat before restoring (causes visible flash)
 * - Gracefully handle missing history (empty thread is valid)
 */

// ── Chat message type (UI-side, matches GlobalChat Message) ──

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  awaitingApproval?: { missionId: string };
  approved?: boolean;
  cancelled?: boolean;
  blocked?: {
    capability: string;
    requiredProviders: string[];
    message: string;
  };
}

// ── Chat snapshot for instant thread restore ────────────────

export interface ChatSnapshot {
  messages: ChatMessage[];
  draftInput: string;
  conversationId: string | null;
  updatedAt: number;
}

// ── Thread ↔ conversation mapping ───────────────────────────

const threadConversationMap = new Map<string, string>();
const chatSnapshots = new Map<string, ChatSnapshot>();

/**
 * Resolve or create a stable conversationId for a thread.
 * If already mapped, returns the existing one. Otherwise creates a new UUID
 * and links it, ensuring the same thread always reuses the same conversationId.
 */
export function resolveConversationId(threadId: string | undefined | null): string {
  if (!threadId) return crypto.randomUUID();
  const existing = threadConversationMap.get(threadId);
  if (existing) return existing;
  const newId = crypto.randomUUID();
  threadConversationMap.set(threadId, newId);
  return newId;
}

// ── Chat snapshot persistence ───────────────────────────────

/**
 * Save the current chat UI state for a thread.
 * Called before switching away from a thread.
 */
export function saveChatSnapshot(
  threadId: string,
  messages: ChatMessage[],
  draftInput: string,
  conversationId: string | null,
): void {
  chatSnapshots.set(threadId, {
    messages: [...messages],
    draftInput,
    conversationId,
    updatedAt: Date.now(),
  });

  if (conversationId) {
    threadConversationMap.set(threadId, conversationId);
  }
}

/**
 * Retrieve the chat snapshot for a thread.
 * Returns null if no snapshot exists (new or unvisited thread).
 */
export function getChatSnapshot(threadId: string): ChatSnapshot | null {
  return chatSnapshots.get(threadId) ?? null;
}

/**
 * Clear a thread's chat snapshot (e.g. on thread deletion).
 */
export function clearChatSnapshot(threadId: string): void {
  chatSnapshots.delete(threadId);
  threadConversationMap.delete(threadId);
}

