"use client";

import type {
  RightPanelMission,
  RightPanelSchedulerSummary,
  RightPanelMissionOpsSummary,
} from "@/lib/ui/right-panel/types";
import { formatMissionSchedule } from "@/lib/runtime/missions/format";

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return "< 1 min";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}j`;
}

const STATUS_DOT: Record<string, string> = {
  running: "bg-cyan-400 animate-pulse",
  success: "bg-emerald-500",
  failed: "bg-red-500",
  blocked: "bg-amber-500",
  idle: "bg-zinc-600",
};

const SCHEDULER_CHIP: Record<string, { label: string; cls: string }> = {
  leader: { label: "Leader", cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" },
  standby: { label: "Standby", cls: "bg-zinc-500/15 text-zinc-400 border-zinc-500/30" },
  local_fallback: { label: "Local", cls: "bg-amber-500/15 text-amber-400 border-amber-500/30" },
};

function SchedulerChip({ scheduler }: { scheduler?: RightPanelSchedulerSummary }) {
  if (!scheduler) return null;
  const chip = SCHEDULER_CHIP[scheduler.mode] ?? SCHEDULER_CHIP.standby;
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[9px] font-medium ${chip.cls}`}>
      {chip.label}
    </span>
  );
}

function OpsSummaryBadges({ summary }: { summary?: RightPanelMissionOpsSummary }) {
  if (!summary) return null;
  const items: Array<{ count: number; label: string; cls: string }> = [];
  if (summary.running > 0) items.push({ count: summary.running, label: "running", cls: "text-cyan-400" });
  if (summary.failed > 0) items.push({ count: summary.failed, label: "failed", cls: "text-red-400" });
  if (summary.blocked > 0) items.push({ count: summary.blocked, label: "blocked", cls: "text-amber-400" });
  if (items.length === 0) return null;
  return (
    <div className="flex gap-2">
      {items.map((item) => (
        <span key={item.label} className={`text-[9px] ${item.cls}`}>
          {item.count} {item.label}
        </span>
      ))}
    </div>
  );
}

function SkeletonMissions() {
  return (
    <div className="space-y-2">
      {[1, 2].map((i) => (
        <div key={i} className="flex animate-pulse items-center gap-2 rounded-lg px-2 py-2">
          <span className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
          <span className="h-3 flex-1 rounded bg-zinc-800/60" />
          <span className="h-3 w-14 rounded bg-zinc-800/40" />
        </div>
      ))}
    </div>
  );
}

export function MissionsSection({
  missions,
  loading,
  error,
  selectedMissionId,
  onMissionSelect,
  onCreateMission,
  scheduler,
  missionOpsSummary,
}: {
  missions: RightPanelMission[];
  loading: boolean;
  error: boolean;
  selectedMissionId?: string;
  onMissionSelect?: (mission: RightPanelMission) => void;
  onCreateMission?: () => void;
  scheduler?: RightPanelSchedulerSummary;
  missionOpsSummary?: RightPanelMissionOpsSummary;
}) {
  return (
    <section className="mb-4">
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
            Automation
          </h3>
          <SchedulerChip scheduler={scheduler} />
        </div>
        {onCreateMission && (
          <button
            onClick={onCreateMission}
            className="text-[10px] text-zinc-600 transition-colors duration-150 hover:text-zinc-400"
          >
            + New
          </button>
        )}
      </div>

      <OpsSummaryBadges summary={missionOpsSummary} />

      {loading ? (
        <SkeletonMissions />
      ) : error ? (
        <p className="px-2 text-xs text-zinc-600">Sign in to activate</p>
      ) : missions.length === 0 ? (
        <p className="px-2 text-xs text-zinc-600">No missions scheduled</p>
      ) : (
        <div className="space-y-0.5">
          {missions.map((mission) => {
            const dotStatus = mission.opsStatus ?? (mission.enabled ? "idle" : "idle");
            const dotCls = STATUS_DOT[dotStatus] ?? STATUS_DOT.idle;

            return (
              <button
                key={mission.id}
                onClick={() => onMissionSelect?.(mission)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-150 ${
                  selectedMissionId === mission.id
                    ? "bg-zinc-800/50 ring-1 ring-cyan-500/15"
                    : "hover:bg-zinc-900/30"
                }`}
              >
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${mission.enabled ? dotCls : "bg-zinc-700"}`} />
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                  {mission.name.length > 35 ? mission.name.slice(0, 35) + "…" : mission.name}
                </p>
                <span className="shrink-0 text-[10px] text-zinc-600">
                  {!mission.enabled ? "Paused" : mission.opsStatus === "running" ? "Running" : mission.opsStatus === "failed" ? "Failed" : mission.opsStatus === "blocked" ? "Blocked" : "Active"}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
