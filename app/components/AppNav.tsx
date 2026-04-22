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
  active: "menu-item-active text-white/88",
  rest: "text-white/54",
  faded: "text-white/30",
};

export default function AppNav() {
  const sidebar = useSidebarOptional();
  const threadSwitch = useThreadSwitchOptional();
  const { state: haloState } = useHaloRuntime();

  const handleThreadSelect = (threadId: string) => {
    threadSwitch?.switchToThread(threadId);
  };

  const activeThreadId = sidebar?.state.activeThreadId;
  const activeThread = sidebar?.activeThread;
  const isCollapsed = sidebar?.isCollapsed ?? false;
  const groupedThreads = sidebar?.groupedThreads ?? [];
  const threadCount = sidebar?.state.threads.length ?? 0;
  const pinnedCount = sidebar?.state.threads.filter((thread) => thread.pinned).length ?? 0;

  return (
    <aside
      className={`compact-shell-left-rail ghost-side-panel fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-white/6 transition-[width] duration-300 md:flex ${
        isCollapsed ? "app-nav-collapsed-width w-[68px]" : "app-nav-expanded-width w-[300px]"
      }`}
    >
      {/* ── Workspace header ─────────────────────────────── */}
      <div className="relative flex h-[76px] shrink-0 items-center gap-3 border-b border-white/6 px-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hearst-logo.svg"
          alt="Hearst AI"
          className={`shrink-0 drop-shadow-[0_0_8px_rgba(46,207,206,0.18)] ${isCollapsed ? "h-5" : "h-8"}`}
        />
        {!isCollapsed && (
          <div className="ml-auto flex items-center gap-2">
            <span className="status-dot w-1 h-1" />
            <span className="font-mono text-[9px] tracking-[0.22em] uppercase text-white/22">
              En ligne
            </span>
          </div>
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
        <div className="ghost-side-section shrink-0 px-5 py-5">
          <p className="ghost-kicker">Activity</p>
          <div className="mt-4 space-y-3">
            {haloState.coreState !== "idle" ? (
              <>
                <div className="status-indicator">
                  <div className="status-dot" />
                  <span className="truncate">{haloState.flowLabel || "Processing Data Stream"}</span>
                </div>
                <p className="text-[14px] leading-7 text-white/48">
                  {sublineForFlow(haloState.flowLabel) || "L'agent travaille sur votre demande"}
                </p>
              </>
            ) : (
              <>
                <div className="status-indicator">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <span className="truncate">Système en veille</span>
                </div>
                <p className="text-[14px] leading-7 text-white/44">Aucune mission active</p>
              </>
            )}
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className="ghost-side-section shrink-0 px-5 py-5">
          <p className="ghost-kicker">Active context</p>
          <div className="mt-4 min-w-0">
            <p className="truncate text-[14px] font-medium leading-tight text-white/88">
              {activeThread?.title ?? "Nouveau fil"}
            </p>
            <p className="mt-2 text-[13px] leading-6 text-white/50">
              {threadCount} fils en memoire{pinnedCount > 0 ? ` · ${pinnedCount} epingle${pinnedCount > 1 ? "s" : ""}` : ""}
            </p>
          </div>
        </div>
      )}

      {/* ── Thread memory ────────────────────────────────── */}
      <div className="ghost-side-section flex-1 overflow-y-auto scrollbar-hide">
        {isCollapsed ? (
          <CollapsedThreads
            threads={sidebar?.state.threads ?? []}
            activeThreadId={activeThreadId}
            onSelect={handleThreadSelect}
          />
        ) : (
          <>
            <div className="px-5 pb-1 pt-5">
              <p className="ghost-kicker">Memory</p>
            </div>
            {groupedThreads.length === 0 && (
              <p className="px-5 pt-2 text-[13px] italic text-white/30">
                Commencez à écrire…
              </p>
            )}

            {groupedThreads.map((group) => (
              <div key={group.group} className="mb-2">
                <div className="px-5 pb-2 pt-5">
                  <p className="font-mono text-[10px] font-normal uppercase tracking-[0.24em] text-white/32">
                    {group.label}
                  </p>
                </div>
                <div className="min-w-0 space-y-1 px-3">
                  {group.threads.map((thread) => (
                    <ThreadRow
                      key={thread.id}
                      thread={thread}
                      activeThreadId={activeThreadId}
                      onSelect={() => handleThreadSelect(thread.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* ── Bottom logo ── */}
      <div className="shrink-0 flex items-center justify-center border-t border-white/6 py-5">
        <svg
          className="h-5 w-5 opacity-24 transition-opacity hover:opacity-40"
          viewBox="560 455 155 170"
          fill="#2ecfce"
        >
          <polygon points="601.7 466.9 572.6 466.9 572.6 609.7 601.7 609.7 601.7 549.1 633.1 579.4 665.8 579.4 601.7 517.5 601.7 466.9" />
          <polygon points="672.7 466.9 672.7 528.1 644.6 500.9 612 500.9 672.7 559.7 672.7 609.7 701.9 609.7 701.9 466.9 672.7 466.9" />
        </svg>
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
  return (
    <button
      onClick={onSelect}
      className={`menu-item w-full text-left ${THREAD_STYLES[visual]}`}
    >
      <div className="min-w-0 overflow-hidden space-y-1">
        <div className="flex items-baseline gap-2">
          {thread.pinned && (
            <span className="text-[8px] text-cyan-accent/30">●</span>
          )}
            <span className="min-w-0 truncate text-[12px] font-medium tracking-[0.04em]">
            {thread.title}
          </span>
        </div>
        {showPreview && thread.preview && (
          <span className="bounded-anywhere line-clamp-2 text-[11px] leading-tight text-white/38">
            {thread.preview}
          </span>
        )}
      </div>
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
    <div className="flex flex-col items-center gap-2.5 pt-5">
      {recent.map((t) => {
        const isActive = t.id === activeThreadId;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t.id)}
            title={t.title}
            className={`h-1.5 w-1.5 rounded-full transition-[background-color,transform] duration-300 ${
              isActive
                ? "scale-125 bg-white/50"
                : "bg-white/12 hover:bg-white/22"
            }`}
          />
        );
      })}
    </div>
  );
}
