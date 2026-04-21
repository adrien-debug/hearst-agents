/**
 * useThreadSwitch — orchestrates thread switching with session restoration.
 *
 * Bridges sidebar (thread memory) and surface (operating context) so that
 * switching threads saves the current context and restores the new one.
 *
 * This is the single integration point between the two state systems.
 * Components should use this instead of calling sidebar.selectThread() directly
 * when full context restoration is desired.
 */

import { useCallback } from "react";
import { useSidebar } from "@/app/hooks/use-sidebar";
import { useSurface } from "@/app/hooks/use-surface";
import {
  saveThreadSession,
  getThreadSession,
} from "@/app/lib/surface-state";

export interface UseThreadSwitchResult {
  /** Switch to an existing thread with full context save/restore. */
  switchToThread: (threadId: string) => void;
  /** Clear active thread and reset surface to fresh state. */
  startNewThread: () => void;
}

export function useThreadSwitch(): UseThreadSwitchResult {
  const sidebar = useSidebar();
  const surface = useSurface();

  const switchToThread = useCallback((threadId: string) => {
    const currentThreadId = sidebar.state.activeThreadId;

    if (currentThreadId && currentThreadId !== threadId) {
      saveThreadSession(currentThreadId, surface.state);
    }

    sidebar.selectThread(threadId);

    const session = getThreadSession(threadId);
    surface.restoreSession(session);
  }, [sidebar, surface]);

  const startNewThread = useCallback(() => {
    const currentThreadId = sidebar.state.activeThreadId;
    if (currentThreadId) {
      saveThreadSession(currentThreadId, surface.state);
    }

    sidebar.clearActiveThread();
    surface.reset();
  }, [sidebar, surface]);

  return { switchToThread, startNewThread };
}
