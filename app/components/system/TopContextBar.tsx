"use client";

import { useHaloRuntime } from "@/app/lib/halo-runtime-context";

export function TopContextBar() {
  const { state: halo } = useHaloRuntime();
  const isActive = halo.coreState !== "idle";

  return (
    <div className="shrink-0 border-b border-white/5 flex items-center h-8 px-6">
      {isActive && (
        <div className="flex items-center gap-2">
          <span className="w-1 h-1 rounded-full bg-cyan-accent/60 animate-pulse" />
          <span className="font-mono text-[8px] tracking-[0.25em] uppercase text-white/25">
            {halo.flowLabel ?? "processing"}
          </span>
        </div>
      )}
    </div>
  );
}
