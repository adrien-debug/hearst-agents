"use client";

/**
 * RightPanel — Trust Layer (minimal).
 *
 * 200px fixed. Missions only (3 max). No timeline.
 * Opacity 40% default, 100% on hover.
 * Disappears on laptop (< 1280px).
 */

import { useRightPanel } from "@/app/hooks/use-right-panel";
import type { RightPanelMission } from "@/lib/ui/right-panel/types";

export default function RightPanel() {
  const { data } = useRightPanel();

  const missions = data.missions ?? [];
  const recentMissions = missions.slice(0, 3);

  return (
    <aside className="hidden xl:flex w-[200px] shrink-0 flex-col border-l border-white/[0.06] bg-[#0c0c10] opacity-40 hover:opacity-100 transition-opacity duration-150">
      {/* Header */}
      <div className="flex h-[48px] shrink-0 items-center px-3 border-b border-white/[0.06]">
        <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/40">
          Trust
        </span>
      </div>

      {/* Content — missions only */}
      <div className="flex-1 overflow-y-auto py-3 scrollbar-hide">
        {recentMissions.length > 0 ? (
          <div className="space-y-0.5">
            {recentMissions.map((mission) => (
              <MissionRow key={mission.id} mission={mission} />
            ))}
          </div>
        ) : (
          <div className="px-3 py-4">
            <p className="text-[11px] text-white/20">No active missions</p>
          </div>
        )}
      </div>

      {/* Bottom — subtle count */}
      {missions.length > 0 && (
        <div className="shrink-0 border-t border-white/[0.06] py-2 px-3">
          <span className="text-[9px] text-white/15 font-mono">
            {missions.length} mission{missions.length > 1 ? "s" : ""}
          </span>
        </div>
      )}
    </aside>
  );
}

function MissionRow({ mission }: { mission: RightPanelMission }) {
  const isRunning = mission.opsStatus === "running";
  const isEnabled = mission.enabled;

  return (
    <div className="flex items-center gap-2 px-3 py-2 group cursor-pointer hover:bg-white/[0.03]">
      <div
        className={`h-1.5 w-1.5 rounded-full shrink-0 ${
          isRunning ? "bg-cyan-400 animate-pulse" : isEnabled ? "bg-white/30" : "bg-white/10"
        }`}
      />
      <span className="flex-1 min-w-0 truncate text-[11px] text-white/50 group-hover:text-white/70">
        {mission.name}
      </span>
      <span className="text-[9px] text-white/20 font-mono uppercase">
        {isRunning ? "run" : isEnabled ? "on" : "off"}
      </span>
    </div>
  );
}
