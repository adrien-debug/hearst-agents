"use client";

import { useRunStreamOptional } from "@/app/lib/run-stream-context";

export function TopContextBar() {
  const stream = useRunStreamOptional();
  const connected = stream?.connected ?? false;

  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-b border-white/[0.05] px-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1.5">
          <span
            className={`h-[5px] w-[5px] rounded-full transition-colors duration-500 ${
              connected ? "bg-white/40" : "bg-white/10"
            }`}
          />
          <span className="text-[11px] font-mono text-zinc-500">
            {connected ? "Live" : "Idle"}
          </span>
        </div>
      </div>
    </div>
  );
}
