"use client";

import { useMemo, useEffect, useState } from "react";
import { useConnectorsPanel } from "@/app/hooks/use-connectors-panel";
import { useRunStreamOptional } from "@/app/lib/run-stream-context";

export function OrchestrationHalo() {
  const { connections } = useConnectorsPanel();
  const stream = useRunStreamOptional();
  const [activeProvider, setActiveProvider] = useState<string | null>(null);

  // Simplified implementation for now to fix the build error
  return (
    <div className="flex items-center justify-center h-10 w-full">
      <div className="flex items-center gap-4 px-6 py-2 rounded-full bg-white/5 backdrop-blur-xl border border-white/10">
        {/* System Core */}
        <div className="relative flex items-center justify-center w-4 h-4">
          <div className="absolute inset-0 rounded-full bg-cyan-400/20 blur-sm animate-pulse" />
          <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
        </div>

        {/* Service Orbit */}
        <div className="flex items-center gap-2">
          {connections.slice(0, 5).map((c) => (
            <div key={c.provider} className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/60">
              {c.provider.charAt(0).toUpperCase()}
            </div>
          ))}
        </div>

        {/* Execution Flow */}
        <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-400/80">
          <span>SYSTEM</span>
          <span className="text-white/20">→</span>
          <span>READY</span>
        </div>
      </div>
    </div>
  );
}
