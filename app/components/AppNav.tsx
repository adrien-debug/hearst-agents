"use client";

/**
 * AppNav — Quiet system memory sidebar.
 *
 * This is thread recall, not navigation. It surfaces past conversations
 * grouped by time, with minimal chrome and no action-heavy affordances.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ ANTI-REGRESSION GUARDRAILS                                      │
 * │                                                                 │
 * │ Do NOT add:                                                     │
 * │  - Feature icons (inbox, calendar, files, tasks, apps)          │
 * │  - Provider or service icons                                    │
 * │  - Route-based navigation items                                 │
 * │  - Counters, badges, or unread indicators                       │
 * │  - Dense preview rows (inbox pattern)                           │
 * │  - Heavy active-row backgrounds                                 │
 * │  - Launcher-style tool rails in collapsed mode                  │
 * └─────────────────────────────────────────────────────────────────┘
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import {
  getThreadVisualState,
  shouldShowPreview,
  type ThreadSummary,
  type ThreadVisualState,
} from "@/app/lib/sidebar-state";

// ── Visual mapping ──────────────────────────────────────────

const THREAD_STYLES: Record<ThreadVisualState, string> = {
  active: "text-zinc-300 opacity-100",
  rest: "text-zinc-500 opacity-80 hover:opacity-100 hover:text-zinc-400",
  faded: "text-zinc-600 opacity-50 hover:opacity-70 hover:text-zinc-500",
};

export default function AppNav() {
  const pathname = usePathname();
  const sidebar = useSidebarOptional();

  const activeThreadId = sidebar?.state.activeThreadId;
  const activeWorkspace = sidebar?.activeWorkspace;
  const isCollapsed = sidebar?.isCollapsed ?? false;
  const groupedThreads = sidebar?.groupedThreads ?? [];

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-zinc-800/30 bg-zinc-950 transition-all duration-300 md:flex ${
        isCollapsed ? "w-[60px]" : "w-[240px]"
      }`}
    >
      {/* ── Workspace header ─────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center gap-3 px-4">
        <Link
          href="/"
          onClick={() => sidebar?.clearActiveThread()}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-900 transition-all duration-200 hover:bg-zinc-800"
          title="Nouveau fil"
        >
          <span className="text-[10px] font-semibold text-zinc-400">H</span>
        </Link>
        {!isCollapsed && activeWorkspace && (
          <span className="truncate text-[10px] tracking-wide text-zinc-600 uppercase">
            {activeWorkspace.label}
          </span>
        )}
        {!isCollapsed && (
          <button
            onClick={() => sidebar?.toggleCollapsed()}
            className="ml-auto text-zinc-800 hover:text-zinc-600 transition-colors"
            title="Réduire"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
            </svg>
          </button>
        )}
        {isCollapsed && (
          <button
            onClick={() => sidebar?.toggleCollapsed()}
            className="absolute right-2 top-5 text-zinc-800 hover:text-zinc-600 transition-colors"
            title="Étendre"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Thread memory ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide">
        {isCollapsed ? (
          <CollapsedThreads
            threads={sidebar?.state.threads ?? []}
            activeThreadId={activeThreadId}
            onSelect={(id) => sidebar?.selectThread(id)}
          />
        ) : (
          <>
            {groupedThreads.length === 0 && (
              <p className="px-5 pt-6 text-[10px] text-zinc-800 italic">
                Commencez à écrire…
              </p>
            )}

            {groupedThreads.map((group) => (
              <div key={group.group} className="mb-1">
                <div className="px-5 pb-1 pt-4">
                  <span className="text-[9px] tracking-widest text-zinc-700 uppercase">
                    {group.label}
                  </span>
                </div>
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    activeThreadId={activeThreadId}
                    onSelect={() => sidebar?.selectThread(thread.id)}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── System access (outside memory space) ─────────── */}
      <div className="shrink-0 px-3 pb-3 pt-2">
        <Link
          href="/admin"
          title="Administration"
          className={`flex items-center rounded-md transition-all duration-200 ${
            isCollapsed ? "h-7 w-7 justify-center mx-auto" : "h-7 gap-2 px-2"
          } ${
            pathname.startsWith("/admin")
              ? "text-zinc-500"
              : "text-zinc-800 hover:text-zinc-600"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5 shrink-0">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.204-.107-.397.165-.71.505-.78.929l-.15.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.506-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.765-.383.93-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          {!isCollapsed && (
            <span className="text-[9px] tracking-wide uppercase">Ops</span>
          )}
        </Link>
      </div>
    </aside>
  );
}

// ── Thread row ──────────────────────────────────────────────

function ThreadRow({
  thread,
  activeThreadId,
  onSelect,
}: {
  thread: ThreadSummary;
  activeThreadId: string | undefined;
  onSelect: () => void;
}) {
  const visual = getThreadVisualState(thread, activeThreadId);
  const showPreview = shouldShowPreview(thread, activeThreadId);
  const isActive = visual === "active";

  return (
    <button
      onClick={onSelect}
      className={`relative flex w-full flex-col px-5 py-1.5 text-left transition-all duration-300 ${THREAD_STYLES[visual]}`}
    >
      {isActive && (
        <span className="absolute left-2 top-1/2 h-3 w-[1.5px] -translate-y-1/2 rounded-full bg-cyan-500/40" />
      )}
      <div className="flex items-baseline gap-2">
        {thread.pinned && (
          <span className="text-[7px] text-cyan-700/60">●</span>
        )}
        <span className="truncate text-[11px] leading-tight">
          {thread.title}
        </span>
      </div>
      {showPreview && thread.preview && (
        <span className="mt-0.5 truncate text-[10px] text-zinc-600/60 leading-tight">
          {thread.preview}
        </span>
      )}
    </button>
  );
}

// ── Collapsed thread indicators ─────────────────────────────

function CollapsedThreads({
  threads,
  activeThreadId,
  onSelect,
}: {
  threads: ThreadSummary[];
  activeThreadId: string | undefined;
  onSelect: (id: string) => void;
}) {
  const recent = threads.slice(0, 8);
  return (
    <div className="flex flex-col items-center gap-1.5 pt-2">
      {recent.map((t) => {
        const isActive = t.id === activeThreadId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            title={t.title}
            className={`h-1.5 w-1.5 rounded-full transition-all duration-300 ${
              isActive
                ? "bg-cyan-500/50 scale-125"
                : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          />
        );
      })}
    </div>
  );
}
