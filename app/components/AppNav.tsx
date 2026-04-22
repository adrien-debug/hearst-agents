"use client";

/**
 * AppNav — Thread Recall (radical minimalism).
 *
 * 72px fixed width. Monograms only. No headers. No counters.
 * This is memory, not navigation.
 */

import { useSidebarOptional } from "@/app/hooks/use-sidebar";
import { useThreadSwitchOptional } from "@/app/hooks/use-thread-switch";
import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import type { ThreadSummary } from "@/app/lib/sidebar-state";

const AVATAR_COLORS = [
  "bg-white/10",
  "bg-cyan-500/10",
  "bg-indigo-500/10",
  "bg-emerald-500/10",
  "bg-amber-500/10",
];

function getMonogram(title: string): string {
  const words = title.trim().split(/\s+/);
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function getAvatarColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

export default function AppNav() {
  const sidebar = useSidebarOptional();
  const threadSwitch = useThreadSwitchOptional();
  const { state: haloState } = useHaloRuntime();

  const handleThreadSelect = (threadId: string) => {
    threadSwitch?.switchToThread(threadId);
  };

  const activeThreadId = sidebar?.state.activeThreadId;
  const threads = sidebar?.state.threads ?? [];
  const isRunning = haloState.coreState !== "idle";

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-full w-[72px] flex-col border-r border-white/[0.06] bg-[#0c0c10] md:flex">
      {/* Logo */}
      <div className="flex h-[56px] shrink-0 items-center justify-center border-b border-white/[0.06]">
        <svg className="h-5 w-5 opacity-60" viewBox="560 455 155 170" fill="#2ecfce">
          <polygon points="601.7 466.9 572.6 466.9 572.6 609.7 601.7 609.7 601.7 549.1 633.1 579.4 665.8 579.4 601.7 517.5 601.7 466.9" />
          <polygon points="672.7 466.9 672.7 528.1 644.6 500.9 612 500.9 672.7 559.7 672.7 609.7 701.9 609.7 701.9 466.9 672.7 466.9" />
        </svg>
      </div>

      {/* Thread stack */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        <div className="flex flex-col items-center gap-2">
          {threads.map((thread) => (
            <ThreadAvatar
              key={thread.id}
              thread={thread}
              isActive={thread.id === activeThreadId}
              isRunning={isRunning && thread.id === activeThreadId}
              onClick={() => handleThreadSelect(thread.id)}
            />
          ))}

          {threads.length === 0 && (
            <div className="mt-4 text-[9px] text-white/20 rotate-180 [writing-mode:vertical-lr]">
              Commencez
            </div>
          )}
        </div>
      </div>

      {/* System pulse */}
      <div className="shrink-0 border-t border-white/[0.06] py-3">
        <div className="flex flex-col items-center gap-2">
          <div
            className={`h-1.5 w-1.5 rounded-full transition-colors duration-500 ${
              isRunning ? "bg-cyan-400 shadow-[0_0_6px_rgba(0,229,255,0.6)]" : "bg-white/20"
            }`}
          />
        </div>
      </div>
    </aside>
  );
}

function ThreadAvatar({
  thread,
  isActive,
  isRunning,
  onClick,
}: {
  thread: ThreadSummary;
  isActive: boolean;
  isRunning: boolean;
  onClick: () => void;
}) {
  const monogram = getMonogram(thread.title);
  const bgColor = getAvatarColor(thread.id);

  return (
    <button
      onClick={onClick}
      title={thread.title}
      className="group relative flex items-center justify-center"
    >
      {/* Active indicator */}
      {isActive && (
        <div className="absolute -left-[1px] h-8 w-[2px] rounded-r bg-cyan-400 shadow-[0_0_8px_rgba(0,229,255,0.3)]" />
      )}

      {/* Running pulse ring */}
      {isRunning && (
        <div className="absolute inset-0 rounded-lg animate-pulse bg-cyan-400/10" />
      )}

      {/* Avatar */}
      <div
        className={`
          flex h-10 w-10 items-center justify-center rounded-md text-[11px] font-semibold
          transition-all duration-150
          ${isActive ? "text-white" : "text-white/50 group-hover:text-white/70"}
          ${bgColor}
          ${isActive ? "ring-1 ring-white/20" : ""}
        `}
      >
        {monogram}
      </div>

      {/* Tooltip */}
      <div className="pointer-events-none absolute left-full ml-3 z-50 opacity-0 group-hover:opacity-100 transition-opacity duration-150">
        <div className="whitespace-nowrap rounded-md bg-[#14141a] border border-white/10 px-2 py-1 text-[11px] text-white/70 shadow-lg">
          {thread.title}
        </div>
      </div>
    </button>
  );
}
