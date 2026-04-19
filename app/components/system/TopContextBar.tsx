"use client";

import { useRunStreamOptional } from "@/app/lib/run-stream-context";

export function TopContextBar() {
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-zinc-800/30 px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-[6px] w-[6px] rounded-full ${
              connected
                ? "bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.4)]"
                : "bg-zinc-600"
            }`}
            style={connected ? { animation: "pulse 2s cubic-bezier(0.4,0,0.6,1) infinite" } : undefined}
          />
          <span className="text-[11px] font-medium text-zinc-400">
            {connected ? "Live" : "Idle"}
          </span>
        </div>
        <span className="h-3 w-px bg-zinc-800/50" />
        <span className="text-[11px] text-zinc-600">Autonomous</span>
      </div>
    </div>
  );
}
