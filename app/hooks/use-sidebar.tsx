"use client";

/**
 * useSidebar — React context for quiet thread memory.
 *
 * Provides thread recall, workspace context, and active thread management.
 * Thread selection integrates with surface-state to restore right panel context.
 *
 * Integration contract (thread selection → surface state):
 * - selectThread() resets surface to idle mode (fresh context for recalled thread)
 * - clearActiveThread() resets surface to idle (new thread intent)
 * - Future: thread metadata could carry last known OperatingMode for deeper restore
 *
 * What is NOT here:
 * - Feature navigation
 * - Route-based entries
 * - Counters or badges
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import {
  sidebarReducer,
  createInitialSidebarState,
  createThreadIfNoneExists,
  groupThreadsByTime,
  type SidebarState,
  type ThreadSummary,
  type WorkspaceSummary,
  type GroupedThreads,
} from "@/app/lib/sidebar-state";

export interface SidebarContextValue {
  state: SidebarState;

  // Threads
  setThreads: (threads: ThreadSummary[]) => void;
  selectThread: (threadId: string) => void;
  clearActiveThread: () => void;
  pinThread: (threadId: string, pinned: boolean) => void;
  updateThread: (threadId: string, patch: Partial<Pick<ThreadSummary, "title" | "preview" | "lastMessageAt">>) => void;
  ensureThread: (firstMessage: string) => string;

  // Workspaces
  setWorkspaces: (workspaces: WorkspaceSummary[], activeId?: string) => void;
  selectWorkspace: (workspaceId: string) => void;

  // UI
  toggleCollapsed: () => void;

  // Derived
  activeThread: ThreadSummary | undefined;
  activeWorkspace: WorkspaceSummary | undefined;
  isCollapsed: boolean;
  hasThreads: boolean;
  groupedThreads: GroupedThreads[];
}

const SidebarCtx = createContext<SidebarContextValue | null>(null);

let idCounter = 0;
function generateThreadId(): string {
  return `thread_${Date.now()}_${++idCounter}`;
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(sidebarReducer, undefined, createInitialSidebarState);

  const setThreads = useCallback((threads: ThreadSummary[]) => {
    dispatch({ type: "set_threads", threads });
  }, []);

  const selectThread = useCallback((threadId: string) => {
    dispatch({ type: "select_thread", threadId });
  }, []);

  const clearActiveThread = useCallback(() => {
    dispatch({ type: "clear_active_thread" });
  }, []);

  const pinThread = useCallback((threadId: string, pinned: boolean) => {
    dispatch({ type: "pin_thread", threadId, pinned });
  }, []);

  const updateThread = useCallback((threadId: string, patch: Partial<Pick<ThreadSummary, "title" | "preview" | "lastMessageAt">>) => {
    dispatch({ type: "update_thread", threadId, patch });
  }, []);

  const ensureThread = useCallback((firstMessage: string): string => {
    const { threadId, action } = createThreadIfNoneExists(state, generateThreadId, firstMessage);
    if (action) dispatch(action);
    return threadId;
  }, [state]);

  const setWorkspaces = useCallback((workspaces: WorkspaceSummary[], activeId?: string) => {
    dispatch({ type: "set_workspaces", workspaces, activeId });
  }, []);

  const selectWorkspace = useCallback((workspaceId: string) => {
    dispatch({ type: "select_workspace", workspaceId });
  }, []);

  const toggleCollapsed = useCallback(() => {
    dispatch({ type: "toggle_collapsed" });
  }, []);

  const groupedThreads = useMemo(
    () => groupThreadsByTime(state.threads),
    [state.threads],
  );

  const value = useMemo<SidebarContextValue>(() => ({
    state,
    setThreads,
    selectThread,
    clearActiveThread,
    pinThread,
    updateThread,
    ensureThread,
    setWorkspaces,
    selectWorkspace,
    toggleCollapsed,
    activeThread: state.threads.find((t) => t.id === state.activeThreadId),
    activeWorkspace: state.workspaces.find((w) => w.id === state.activeWorkspaceId),
    isCollapsed: state.collapsed,
    hasThreads: state.threads.length > 0,
    groupedThreads,
  }), [
    state,
    setThreads,
    selectThread,
    clearActiveThread,
    pinThread,
    updateThread,
    ensureThread,
    setWorkspaces,
    selectWorkspace,
    toggleCollapsed,
    groupedThreads,
  ]);

  return (
    <SidebarCtx.Provider value={value}>
      {children}
    </SidebarCtx.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const ctx = useContext(SidebarCtx);
  if (!ctx) throw new Error("useSidebar must be used within SidebarProvider");
  return ctx;
}

export function useSidebarOptional(): SidebarContextValue | null {
  return useContext(SidebarCtx);
}
