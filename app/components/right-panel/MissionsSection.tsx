"use client";

import type {
  RightPanelMission,
  RightPanelSchedulerSummary,
  RightPanelMissionOpsSummary,
} from "@/lib/ui/right-panel/types";

function getRelativeTime(schedule: string): string {
  if (schedule.includes("every day")) return "demain";
  if (schedule.includes("every hour")) return "dans 45min";
  if (schedule.includes("every week")) return "dans 3j";
  if (schedule.includes("* * * * *")) return "dans 1min";
  return "planifié";
}

function SkeletonMissions() {
  return (
    <div className="flex flex-col gap-1">
      {[0, 1].map((i) => (
        <div key={i} className={`flex items-center justify-between py-1.5 ${i === 0 ? "opacity-60" : "opacity-30"}`}>
          <div className="flex items-center gap-3">
            <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
            <span className="h-2 w-24 rounded bg-white/5" />
          </div>
          <span className="h-2 w-12 rounded bg-white/5" />
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  scheduler,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
  const sorted = [...missions].sort((a, b) => {
    const w = (m: RightPanelMission) =>
      m.opsStatus === "running" ? 3
        : m.opsStatus === "blocked" || m.opsStatus === "failed" ? 2
        : m.enabled ? 1 : 0;
    return w(b) - w(a);
  });

  return (
    <section className="relative min-h-[80px] mt-8">
      {loading ? (
        <SkeletonMissions />
      ) : error ? (
        <p className="text-[10px] font-mono text-white/20">Connexion requise</p>
      ) : missions.length === 0 ? (
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-mono text-white/15">Aucune mission planifiée</p>
          {onCreateMission && (
            <button onClick={onCreateMission} className="text-[10px] font-mono text-cyan-400/60 hover:text-cyan-400 transition-colors duration-200">
              + Créer
            </button>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-0">
          {sorted.slice(0, 5).map((mission) => {
            const isRunning = mission.opsStatus === "running";
            const isBlocked = mission.opsStatus === "blocked" || mission.opsStatus === "failed";
            const isUpcoming = mission.enabled && !isRunning && !isBlocked;

            const opClass = isRunning ? "opacity-100" : isBlocked ? "opacity-90" : isUpcoming ? "opacity-60" : "opacity-30";
            const dotCls = isRunning ? "bg-cyan-400 animate-pulse" : isBlocked ? "bg-amber-400" : "bg-white/20";
            const textCls = isRunning ? "text-cyan-400" : isBlocked ? "text-amber-400" : "text-white/60";

            return (
              <button
                key={mission.id}
                onClick={() => onMissionSelect?.(mission)}
                className={`flex w-full items-center justify-between py-1.5 text-left transition-opacity duration-300 hover:opacity-100 ${selectedMissionId === mission.id ? "opacity-100" : opClass}`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotCls}`} />
                  <span className={`text-[10px] font-mono truncate ${textCls}`}>
                    {mission.name}
                  </span>
                </div>
                {(isUpcoming || (!isRunning && !isBlocked && !mission.enabled)) && (
                  <span className="shrink-0 text-[9px] font-mono text-white/20 ml-4">
                    {isUpcoming ? getRelativeTime(mission.schedule) : "inactif"}
                  </span>
                )}
              </button>
            );
          })}

          {onCreateMission && (
            <div className="mt-1.5 flex justify-end">
              <button onClick={onCreateMission} className="text-[9px] font-mono text-white/20 hover:text-cyan-400 transition-colors duration-200">
                + Créer
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
