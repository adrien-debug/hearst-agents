"use client";

/**
 * TopContextBar — Momentum Stream (24px, visible).
 *
 * 24px fixed. Single line. Mono 11px.
 * No controls. No interaction.
 * Pulse visible at 30% opacity when running.
 */

import { useHaloRuntime } from "@/app/lib/halo-runtime-context";

export function TopContextBar() {
  const { state: halo } = useHaloRuntime();
  const isActive = halo.coreState !== "idle";

  return (
    <div className="flex h-6 shrink-0 items-center justify-between px-4 border-b border-white/[0.05]">
      <div className="flex items-center gap-2 min-w-0">
        {isActive ? (
          <>
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(0,229,255,0.4)]" />
            <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-white/40 truncate">
              {halo.flowLabel || "Processing"}
            </span>
          </>
        ) : (
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-white/20">
            System idle
          </span>
        )}
      </div>

      {/* Empty right side — reserved for minimal indicators */}
      <div className="w-1" />
    </div>
  );
}
