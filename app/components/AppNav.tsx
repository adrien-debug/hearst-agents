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
import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import { useThreadSwitchOptional } from "@/app/hooks/use-thread-switch";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { sublineForFlow } from "@/app/lib/manifestation-stage-model";
import {
  getThreadVisualState,
  shouldShowPreview,
  type ThreadSummary,
  type ThreadVisualState,
} from "@/app/lib/sidebar-state";

// ── Visual mapping ──────────────────────────────────────────

const THREAD_STYLES: Record<ThreadVisualState, string> = {
  active: "text-white opacity-100",
  rest: "text-white/50 opacity-80 hover:opacity-100 hover:text-white/70",
  faded: "text-white/30 opacity-50 hover:opacity-70 hover:text-white/50",
};

export default function AppNav() {
  const sidebar = useSidebarOptional();
  const threadSwitch = useThreadSwitchOptional();
  const { state: haloState } = useHaloRuntime();

  const handleThreadSelect = (threadId: string) => {
    threadSwitch?.switchToThread(threadId);
  };

  const handleNewThread = () => {
    threadSwitch?.startNewThread();
  };

  const activeThreadId = sidebar?.state.activeThreadId;
  const activeWorkspace = sidebar?.activeWorkspace;
  const isCollapsed = sidebar?.isCollapsed ?? false;
  const groupedThreads = sidebar?.groupedThreads ?? [];

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-white/5 bg-black transition-[width] duration-300 md:flex ${
        isCollapsed ? "w-[60px]" : "w-[240px]"
      }`}
    >
      {/* ── Workspace header ─────────────────────────────── */}
      <div className="flex h-14 shrink-0 items-center gap-3 px-4">
        <Link
          href="/"
          onClick={handleNewThread}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/5 transition-colors duration-200 hover:bg-white/10"
          title="Nouveau fil"
        >
          <span className="text-[10px] font-semibold text-white/70">H</span>
        </Link>
        {!isCollapsed && activeWorkspace && (
          <span className="truncate text-[10px] tracking-wide text-white/50 uppercase">
            {activeWorkspace.label}
          </span>
        )}
        {!isCollapsed && (
          <span className="ml-auto text-[9px] font-mono tracking-widest text-green-500/70 border border-green-500/20 px-1.5 py-0.5 rounded bg-green-500/5">
            ONLINE
          </span>
        )}
        {isCollapsed && (
          <button
            onClick={() => sidebar?.toggleCollapsed()}
            className="absolute right-2 top-5 text-white/30 hover:text-white/50 transition-colors"
            title="Étendre"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} className="h-3.5 w-3.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Live Activity (HUD) ──────────────────────────── */}
      {!isCollapsed && (
        <div className="shrink-0 px-5 pb-2 pt-4">
          <span className="text-[9px] tracking-widest text-white/50 uppercase">
            Activité en arrière-plan
          </span>
          <div className="mt-2 flex flex-col gap-2">
            {haloState.coreState !== "idle" ? (
              <div className="rounded-md border border-white/10 bg-white/5 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white/90">
                    {haloState.flowLabel || "Traitement..."}
                  </span>
                  <span className="flex h-2 w-2 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white/40 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white/60"></span>
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-white/50">
                    {sublineForFlow(haloState.flowLabel) || "L'agent travaille sur votre demande"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-transparent p-2.5 opacity-50">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-white/90">Système en veille</span>
                  <span className="h-1.5 w-1.5 rounded-full bg-white/20"></span>
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[10px] text-white/50">Aucune mission active</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Thread memory ────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto scrollbar-hide border-t border-white/5 mt-2">
        {isCollapsed ? (
          <CollapsedThreads
            threads={sidebar?.state.threads ?? []}
            activeThreadId={activeThreadId}
            onSelect={handleThreadSelect}
          />
        ) : (
          <>
            <div className="px-5 pt-4 pb-1">
              <span className="text-[9px] tracking-widest text-white/50 uppercase">
                Mémoire (Threads)
              </span>
            </div>
            {groupedThreads.length === 0 && (
              <p className="px-5 pt-2 text-[10px] text-white/30 italic">
                Commencez à écrire…
              </p>
            )}

            {groupedThreads.map((group) => (
              <div key={group.group} className="mb-1">
                <div className="px-5 pb-1 pt-4">
                  <span className="text-[9px] tracking-widest text-white/50 uppercase">
                    {group.label}
                  </span>
                </div>
                {group.threads.map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    activeThreadId={activeThreadId}
                    onSelect={() => handleThreadSelect(thread.id)}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </div>

      <div className="shrink-0 h-3" />
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
      className={`relative flex w-full flex-col px-5 py-1.5 text-left transition-colors duration-300 ${THREAD_STYLES[visual]}`}
    >
      {isActive && (
        <span className="absolute left-2 top-1/2 h-3 w-[1.5px] -translate-y-1/2 rounded-full bg-white/40" />
      )}
      <div className="flex items-baseline gap-2">
        {thread.pinned && (
          <span className="text-[7px] text-white/30">●</span>
        )}
        <span className="truncate text-[11px] leading-tight">
          {thread.title}
        </span>
      </div>
      {showPreview && thread.preview && (
        <span className="mt-0.5 truncate text-[10px] text-white/30 leading-tight">
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
            className={`h-1.5 w-1.5 rounded-full transition-[background-color,transform] duration-300 ${
              isActive
                ? "bg-white/50 scale-125"
                : "bg-white/10 hover:bg-white/20"
            }`}
          />
        );
      })}
    </div>
  );
}
