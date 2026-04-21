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
  active: "menu-item-active text-white/80",
  rest: "text-white/40",
  faded: "text-white/20",
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
  const activeThread = sidebar?.activeThread;
  const activeWorkspace = sidebar?.activeWorkspace;
  const isCollapsed = sidebar?.isCollapsed ?? false;
  const groupedThreads = sidebar?.groupedThreads ?? [];
  const threadCount = sidebar?.state.threads.length ?? 0;
  const pinnedCount = sidebar?.state.threads.filter((thread) => thread.pinned).length ?? 0;

  return (
    <aside
      className={`fixed left-0 top-0 z-40 hidden h-full flex-col border-r border-white/5 transition-[width] duration-300 md:flex ${
        isCollapsed ? "w-[60px]" : "w-[280px]"
      }`}
    >
      {/* ── Workspace header ─────────────────────────────── */}
      <div className="flex h-16 shrink-0 items-center px-4 relative gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hearst-logo.svg"
          alt="Hearst AI"
          className={`shrink-0 drop-shadow-[0_0_8px_rgba(46,207,206,0.3)] ${isCollapsed ? "h-5" : "h-7"}`}
        />
        {!isCollapsed && (
          <div className="flex items-center gap-2 ml-auto">
            <span className="status-dot w-1 h-1" />
            <span className="font-mono text-[8px] tracking-[0.2em] uppercase text-white/20">
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
        <div className="boxed-panel shrink-0 !p-4">
          <h3 className="font-mono text-[9px] font-normal tracking-[0.2em] uppercase text-cyan-accent/50">
            Synaptic Activity
          </h3>
          <div className="mt-3 space-y-3">
            {haloState.coreState !== "idle" ? (
              <>
                <div className="status-indicator">
                  <div className="status-dot animate-pulse" />
                  <span>{haloState.flowLabel || "Processing Data Stream"}</span>
                </div>
                <p className="text-xs text-white/30 leading-relaxed italic">
                  {sublineForFlow(haloState.flowLabel) || "L'agent travaille sur votre demande"}
                </p>
              </>
            ) : (
              <>
                <div className="status-indicator">
                  <span className="w-1.5 h-1.5 rounded-full bg-white/20" />
                  <span>Système en veille</span>
                </div>
                <p className="text-xs text-white/30 leading-relaxed italic">Aucune mission active</p>
              </>
            )}
          </div>
        </div>
      )}

      {!isCollapsed && (
        <div className="boxed-panel shrink-0 !p-4">
          <h3 className="font-mono text-[9px] font-normal tracking-[0.2em] uppercase text-cyan-accent/50">
            Contexte actif
          </h3>
          <div className="mt-3">
            <p className="truncate text-[12px] font-medium leading-tight text-white/85">
              {activeThread?.title ?? "Nouveau fil"}
            </p>
            <p className="mt-1 text-[11px] leading-relaxed text-white/45">
              {threadCount} fils en memoire{pinnedCount > 0 ? ` · ${pinnedCount} epingle${pinnedCount > 1 ? "s" : ""}` : ""}
            </p>
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
              <h3 className="font-mono text-[9px] font-normal tracking-[0.2em] uppercase text-cyan-accent/50">
                Mémoire (Threads)
              </h3>
            </div>
            {groupedThreads.length === 0 && (
              <p className="px-5 pt-2 text-[11px] text-white/30 italic">
                Commencez à écrire…
              </p>
            )}

            {groupedThreads.map((group) => (
              <div key={group.group} className="mb-1">
                <div className="px-5 pb-1 pt-4">
                  <h3 className="font-mono text-[9px] font-normal tracking-[0.2em] uppercase text-cyan-accent/50">
                    {group.label}
                  </h3>
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

      {/* ── Bottom logo ── */}
      <div className="shrink-0 flex items-center justify-center py-4 border-t border-white/5">
        <svg
          className="w-5 h-5 opacity-30 hover:opacity-60 transition-opacity"
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
  const isActive = visual === "active";

  return (
    <button
      onClick={onSelect}
      className={`menu-item w-full text-left ${THREAD_STYLES[visual]}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0">
        <div className="flex items-baseline gap-2">
          {thread.pinned && (
            <span className="text-[7px] text-cyan-accent/40">●</span>
          )}
          <span className="truncate text-[11px] font-medium uppercase tracking-widest">
            {thread.title}
          </span>
        </div>
        {showPreview && thread.preview && (
          <span className="truncate text-[10px] leading-tight text-white/20">
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
