/**
 * Sidebar State — Quiet system memory.
 *
 * The sidebar surfaces conversation threads as recall memory, not as an inbox
 * or navigation list. It must feel archival and calm — like recalling context,
 * not selecting a destination.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ ANTI-REGRESSION GUARDRAILS                                      │
 * │                                                                 │
 * │ Do NOT add to this sidebar:                                     │
 * │  - Feature navigation icons (inbox, calendar, files, tasks)     │
 * │  - Provider or service icons                                    │
 * │  - Route-based navigation items                                 │
 * │  - Counters, badges, or unread indicators                       │
 * │  - Settings or configuration links                              │
 * │  - Loud active-row backgrounds or selection blocks              │
 * │  - Dense preview text that creates inbox-like rhythm            │
 * │                                                                 │
 * │ The sidebar must remain:                                        │
 * │  - Thread-centric recall memory                                 │
 * │  - Typographic and quiet                                        │
 * │  - Temporally grouped (today / earlier / archive)               │
 * │  - Free of action-heavy chrome                                  │
 * └─────────────────────────────────────────────────────────────────┘
 */

// ── Thread model ────────────────────────────────────────────

export interface ThreadSummary {
  id: string;
  title: string;
  lastMessageAt: number;
  /** Short stable preview, only shown for the active thread. */
  preview?: string;
  pinned?: boolean;
}

// ── Workspace model ─────────────────────────────────────────

export interface WorkspaceSummary {
  id: string;
  label: string;
  tenantId: string;
}

// ── Sidebar state ───────────────────────────────────────────

export interface SidebarState {
  workspaces: WorkspaceSummary[];
  activeWorkspaceId?: string;
  threads: ThreadSummary[];
  activeThreadId?: string;
  collapsed: boolean;
}

export function createInitialSidebarState(): SidebarState {
  return {
    workspaces: [],
    threads: [],
    collapsed: false,
  };
}

// ── Actions ─────────────────────────────────────────────────

export type SidebarAction =
  | { type: "set_threads"; threads: ThreadSummary[] }
  | { type: "select_thread"; threadId: string }
  | { type: "create_thread"; thread: ThreadSummary }
  | { type: "pin_thread"; threadId: string; pinned: boolean }
  | { type: "update_thread"; threadId: string; patch: Partial<Pick<ThreadSummary, "title" | "preview" | "lastMessageAt">> }
  | { type: "set_workspaces"; workspaces: WorkspaceSummary[]; activeId?: string }
  | { type: "select_workspace"; workspaceId: string }
  | { type: "toggle_collapsed" }
  | { type: "clear_active_thread" };

// ── Reducer ─────────────────────────────────────────────────

export function sidebarReducer(state: SidebarState, action: SidebarAction): SidebarState {
  switch (action.type) {
    case "set_threads":
      return { ...state, threads: sortThreads(action.threads) };

    case "select_thread":
      return { ...state, activeThreadId: action.threadId };

    case "create_thread":
      return {
        ...state,
        threads: sortThreads([action.thread, ...state.threads]),
        activeThreadId: action.thread.id,
      };

    case "pin_thread":
      return {
        ...state,
        threads: sortThreads(
          state.threads.map((t) =>
            t.id === action.threadId ? { ...t, pinned: action.pinned } : t
          ),
        ),
      };

    case "update_thread":
      return {
        ...state,
        threads: sortThreads(
          state.threads.map((t) =>
            t.id === action.threadId ? { ...t, ...action.patch } : t
          ),
        ),
      };

    case "set_workspaces":
      return {
        ...state,
        workspaces: action.workspaces,
        activeWorkspaceId: action.activeId ?? state.activeWorkspaceId,
      };

    case "select_workspace":
      return { ...state, activeWorkspaceId: action.workspaceId };

    case "toggle_collapsed":
      return { ...state, collapsed: !state.collapsed };

    case "clear_active_thread":
      return { ...state, activeThreadId: undefined };

    default:
      return state;
  }
}

// ── Sorting ─────────────────────────────────────────────────

function sortThreads(threads: ThreadSummary[]): ThreadSummary[] {
  return [...threads].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.lastMessageAt - a.lastMessageAt;
  });
}

// ── View model helpers ──────────────────────────────────────

export type ThreadVisualState = "active" | "rest" | "faded";

/**
 * Derive visual emphasis for a thread row.
 * Active = current thread (subtle glow). Rest = normal. Faded = old threads.
 */
export function getThreadVisualState(
  thread: ThreadSummary,
  activeThreadId: string | undefined,
): ThreadVisualState {
  if (thread.id === activeThreadId) return "active";
  const age = Date.now() - thread.lastMessageAt;
  const ONE_WEEK = 7 * 24 * 60 * 60 * 1000;
  if (age > ONE_WEEK && !thread.pinned) return "faded";
  return "rest";
}

/**
 * Only show preview for the active thread — avoids inbox density.
 * Pinned threads never show preview to keep the surface clean.
 */
export function shouldShowPreview(
  thread: ThreadSummary,
  activeThreadId: string | undefined,
): boolean {
  if (!thread.preview) return false;
  return thread.id === activeThreadId;
}

// ── Temporal grouping ───────────────────────────────────────

export type TemporalGroup = "today" | "yesterday" | "this_week" | "earlier";

export interface GroupedThreads {
  group: TemporalGroup;
  label: string;
  threads: ThreadSummary[];
}

export function groupThreadsByTime(threads: ThreadSummary[]): GroupedThreads[] {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);
  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - 6);

  const buckets: Record<TemporalGroup, ThreadSummary[]> = {
    today: [],
    yesterday: [],
    this_week: [],
    earlier: [],
  };

  for (const t of threads) {
    const ts = t.lastMessageAt;
    if (ts >= todayStart.getTime()) buckets.today.push(t);
    else if (ts >= yesterdayStart.getTime()) buckets.yesterday.push(t);
    else if (ts >= weekStart.getTime()) buckets.this_week.push(t);
    else buckets.earlier.push(t);
  }

  const labels: Record<TemporalGroup, string> = {
    today: "Aujourd'hui",
    yesterday: "Hier",
    this_week: "Cette semaine",
    earlier: "Plus ancien",
  };

  const order: TemporalGroup[] = ["today", "yesterday", "this_week", "earlier"];
  return order
    .filter((g) => buckets[g].length > 0)
    .map((g) => ({ group: g, label: labels[g], threads: buckets[g] }));
}

// ── Title / preview derivation ──────────────────────────────

export function deriveThreadTitle(firstMessage: string): string {
  const cleaned = firstMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 48) return cleaned;
  return cleaned.slice(0, 45) + "…";
}

export function deriveThreadPreview(lastMessage: string): string {
  const cleaned = lastMessage.replace(/\s+/g, " ").trim();
  if (cleaned.length <= 80) return cleaned;
  return cleaned.slice(0, 77) + "…";
}

// ── Implicit thread creation ────────────────────────────────

export function createThreadIfNoneExists(
  state: SidebarState,
  generateId: () => string,
  firstMessage: string,
): { threadId: string; action: SidebarAction | null } {
  if (state.activeThreadId) {
    return { threadId: state.activeThreadId, action: null };
  }

  const id = generateId();
  const thread: ThreadSummary = {
    id,
    title: deriveThreadTitle(firstMessage),
    lastMessageAt: Date.now(),
    preview: deriveThreadPreview(firstMessage),
  };

  return {
    threadId: id,
    action: { type: "create_thread", thread },
  };
}
