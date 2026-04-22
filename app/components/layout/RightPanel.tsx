"use client";

/**
 * RightPanel — Rail droit Trust
 *
 * 200px fixed, visible uniquement sur xl+
 */

import { useRuntimeStore } from "@/stores/runtime";

const selectEvents = (s: { events: unknown[] }) => s.events;
const selectCurrentRunId = (s: { currentRunId: string | null }) => s.currentRunId;

export default function RightPanel() {
  const events = useRuntimeStore(selectEvents);
  const currentRunId = useRuntimeStore(selectCurrentRunId);

  interface MissionEvent {
    type: string;
    name?: string;
    [key: string]: unknown;
  }

  const missions = (events as MissionEvent[])
    .filter((e) => e.type === "scheduled_mission_created")
    .slice(0, 3);

  return (
    <aside className="hidden xl:flex fixed right-0 top-0 bottom-0 w-[200px] flex-col border-l border-white/[0.06] bg-rail z-20">
      {/* Header */}
      <div className="h-[48px] flex items-center px-3 border-b border-white/[0.06]">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40">
          Trust
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        {missions.length > 0 ? (
          <div className="space-y-0.5">
            {missions.map((m, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-3 py-2 group cursor-pointer hover:bg-white/[0.03]"
              >
                <div className="h-1.5 w-1.5 rounded-full bg-white/30" />
                <span className="flex-1 min-w-0 truncate text-[11px] text-white/50 group-hover:text-white/70">
                  {m.name || "Mission"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3 py-4">
            <p className="text-[11px] text-white/20">No active missions</p>
          </div>
        )}
      </div>

      {/* Bottom */}
      {currentRunId && (
        <div className="shrink-0 border-t border-white/[0.06] py-2 px-3">
          <span className="text-[9px] text-white/15 font-mono">
            Run: {currentRunId.slice(0, 8)}
          </span>
        </div>
      )}
    </aside>
  );
}
