"use client";

/**
 * RightPanel — Trust Layer
 *
 * Fixed right panel, 240px width, coherent spacing
 */

import { useRuntimeStore } from "@/stores/runtime";

const selectEvents = (s: { events: unknown[] }) => s.events;
const selectCurrentRunId = (s: { currentRunId: string | null }) => s.currentRunId;

interface MissionEvent {
  type: string;
  name?: string;
  [key: string]: unknown;
}

export default function RightPanel() {
  const events = useRuntimeStore(selectEvents);
  const currentRunId = useRuntimeStore(selectCurrentRunId);

  const missions = (events as MissionEvent[])
    .filter((e) => e.type === "scheduled_mission_created")
    .slice(0, 5);

  return (
    <aside className="hidden xl:flex fixed right-0 top-0 bottom-0 w-[240px] panel z-10">
      {/* Header — 48px */}
      <div className="panel-header">
        <span className="text-label">Trust</span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-hide py-3">
        {missions.length > 0 ? (
          <div className="space-y-1">
            {missions.map((m, i) => (
              <div key={i} className="panel-item">
                <div className="status-dot-idle" />
                <span className="text-caption truncate flex-1">
                  {m.name || "Mission"}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-4 py-3">
            <p className="text-caption">Aucune mission active</p>
          </div>
        )}
      </div>

      {/* Footer */}
      {currentRunId && (
        <div className="border-t border-white/[0.08] py-3 px-4">
          <div className="flex items-center gap-2">
            <div className="status-dot animate-pulse" />
            <span className="text-mono text-white/30">
              {currentRunId.slice(0, 8)}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
