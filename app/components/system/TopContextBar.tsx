"use client";

import { useHaloRuntime } from "@/app/lib/halo-runtime-context";
import { MomentumIndicator } from "@/app/components/system/MomentumIndicator";

export function TopContextBar() {
  const { state: halo } = useHaloRuntime();
  const isActive = halo.coreState !== "idle";

  return (
    <div className="flex h-8 shrink-0 items-center justify-between gap-4 border-b border-white/5 px-6">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {isActive && (
          <>
            <span className="h-1 w-1 shrink-0 animate-pulse rounded-full bg-cyan-accent/60" />
            <span className="font-mono text-[8px] tracking-[0.25em] text-white/25 uppercase">
              {halo.flowLabel ?? "processing"}
            </span>
          </>
        )}
      </div>
      <MomentumIndicator />
    </div>
  );
}
