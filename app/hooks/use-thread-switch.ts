/**
 * useThreadSwitch — full rehydration orchestrator.
 *
 * Bridges sidebar, surface, chat, and Halo so that switching threads
 * restores a complete cognitive operating context, not just partial UI state.
 *
 * Rehydration flow:
 * 1. Save current thread: surface state + chat snapshot
 * 2. Select new thread in sidebar
 * 3. Restore surface state (mode, intent, mission, panel)
 * 4. Notify chat to swap messages + draft (via callback)
 * 5. Resolve Halo restoration state
 *
 * Ownership:
 * - Thread selection: sidebar state
 * - Surface/panel/mission restore: surface state
 * - Chat message snapshot: thread-memory
 * - Halo restoration: halo-state (resolveRestoredHaloState)
 *
 * Guardrails:
 * - Do NOT clear chat before restoring (causes visible flash)
 * - Do NOT replay messages one-by-one
 * - Do NOT reset right panel to idle when a snapshot exists
 * - Do NOT restore stale connection interrupts
 * - Do NOT re-animate historical Halo success states
 */

import { useCallback, useRef } from "react";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import { useSurfaceOptional } from "@/app/hooks/use-surface";
import {
  saveThreadSession,
  getThreadSession,
} from "@/app/lib/surface-state";
import {
  saveChatSnapshot,
  getChatSnapshot,
  type ChatMessage,
  type ChatSnapshot,
} from "@/app/lib/thread-memory";
import { resolveRestoredHaloState, type HaloState } from "@/app/lib/halo-state";

// ── Chat restore callback ───────────────────────────────────

/**
 * Callback contract for chat rehydration.
 * GlobalChat registers this so useThreadSwitch can restore messages
 * without direct coupling to chat component internals.
 */
export interface ChatRestoreCallbacks {
  getMessages: () => ChatMessage[];
  getDraftInput: () => string;
  getConversationId: () => string | null;
  restore: (snapshot: ChatSnapshot | null) => void;
}

// ── Hook result ─────────────────────────────────────────────

export interface UseThreadSwitchResult {
  switchToThread: (threadId: string) => void;
  startNewThread: () => void;
  registerChatCallbacks: (callbacks: ChatRestoreCallbacks) => void;
  /** Last resolved Halo state from thread switch (for Halo consumers). */
  restoredHaloState: HaloState | null;
}

export function useThreadSwitch(): UseThreadSwitchResult {
  const sidebar = useSidebarOptional();
  const surface = useSurfaceOptional();
  const chatCallbacksRef = useRef<ChatRestoreCallbacks | null>(null);
  const restoredHaloRef = useRef<HaloState | null>(null);

  const registerChatCallbacks = useCallback((callbacks: ChatRestoreCallbacks) => {
    chatCallbacksRef.current = callbacks;
  }, []);

  const saveCurrentThread = useCallback(() => {
    const currentId = sidebar?.state.activeThreadId;
    if (!currentId || !surface) return;

    saveThreadSession(currentId, surface.state);

    const chat = chatCallbacksRef.current;
    if (chat) {
      saveChatSnapshot(
        currentId,
        chat.getMessages(),
        chat.getDraftInput(),
        chat.getConversationId(),
      );
    }
  }, [sidebar?.state.activeThreadId, surface]);

  const switchToThread = useCallback((threadId: string) => {
    if (!sidebar || !surface) return;
    const currentId = sidebar.state.activeThreadId;
    if (currentId === threadId) return;

    // 1. Save current context
    saveCurrentThread();

    // 2. Select thread in sidebar
    sidebar.selectThread(threadId);

    // 3. Restore surface state (mode, intent, mission, panel)
    const session = getThreadSession(threadId);
    surface.restoreSession(session);

    // 4. Restore chat messages + draft (immediate layer)
    const chatSnapshot = getChatSnapshot(threadId);
    chatCallbacksRef.current?.restore(chatSnapshot);

    // 5. Resolve Halo restoration
    restoredHaloRef.current = resolveRestoredHaloState(
      session?.intentFlowSnapshot.stage,
      session?.missionSnapshot?.phase,
    );
  }, [sidebar, surface, saveCurrentThread]);

  const startNewThread = useCallback(() => {
    if (!sidebar || !surface) return;

    saveCurrentThread();

    sidebar.clearActiveThread();
    surface.reset();
    chatCallbacksRef.current?.restore(null);
    restoredHaloRef.current = null;
  }, [sidebar, surface, saveCurrentThread]);

  return {
    switchToThread,
    startNewThread,
    registerChatCallbacks,
    restoredHaloState: restoredHaloRef.current,
  };
}

/**
 * Optional version for components that may render outside providers.
 */
export function useThreadSwitchOptional(): UseThreadSwitchResult | null {
  const sidebar = useSidebarOptional();
  const surface = useSurfaceOptional();

  const result = useThreadSwitch();

  if (!sidebar || !surface) return null;
  return result;
}
