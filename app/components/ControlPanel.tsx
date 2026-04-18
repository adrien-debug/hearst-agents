"use client";

import { useMission, cancelMission } from "../lib/missions";
import { useConnectedServices } from "../hooks/use-connected-services";
import { useRecentMissions, type RecentMission } from "../hooks/use-recent-missions";

const STATUS_ICON: Record<string, React.ReactNode> = {
  done: <span className="text-emerald-400">✓</span>,
  in_progress: <span className="text-zinc-300 animate-pulse">●</span>,
  waiting: <span className="text-zinc-600">○</span>,
  error: <span className="text-red-400">✗</span>,
  needs_approval: <span className="text-amber-400">⏸</span>,
};

const STATUS_LABEL: Record<string, string> = {
  done: "Terminé",
  in_progress: "En cours",
  waiting: "En attente",
  error: "Erreur",
  needs_approval: "En attente de validation",
};

const MISSION_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  created: { label: "Démarrage…", color: "text-zinc-400" },
  running: { label: "En cours", color: "text-zinc-300" },
  awaiting_approval: { label: "En attente de validation", color: "text-amber-400" },
  completed: { label: "Terminé", color: "text-emerald-400" },
  failed: { label: "Erreur", color: "text-red-400" },
  cancelled: { label: "Annulé", color: "text-zinc-500" },
};

const CORE_SERVICES = [
  { id: "google", label: "Gmail / Calendar / Drive" },
  { id: "slack", label: "Slack" },
];

const RECENT_STATUS: Record<string, { label: string; icon: string; color: string }> = {
  completed: { label: "Terminé", icon: "✓", color: "text-emerald-400" },
  failed: { label: "Erreur", icon: "✗", color: "text-red-400" },
  running: { label: "En cours", icon: "●", color: "text-cyan-400" },
  cancelled: { label: "Annulé", icon: "—", color: "text-zinc-500" },
  created: { label: "Créé", icon: "○", color: "text-zinc-400" },
  awaiting_approval: { label: "Validation", icon: "⏸", color: "text-amber-400" },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `Il y a ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Il y a ${hours}h`;
  const days = Math.floor(hours / 24);
  return `Il y a ${days}j`;
}

export default function ControlPanel() {
  const { activeMission: mission, backgroundMissions, dismissMission, setActiveMission } = useMission();
  const { isConnected, loading: servicesLoading } = useConnectedServices();
  const { missions: recentMissions, loading: missionsLoading } = useRecentMissions();

  const hasMission = !!mission;
  const doneCount = mission?.actions.filter((a) => a.status === "done").length ?? 0;
  const totalCount = mission?.actions.length ?? 0;
  const isRunning = mission?.status === "running" || mission?.status === "created";

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950/95 lg:flex">
      <div className="flex-1 overflow-y-auto p-4">
        {/* ─── Result (always first) ─── */}
        {mission?.result && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Résultat
            </h3>
            <div className="rounded-lg border border-emerald-900/30 bg-emerald-950/10 p-3">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                {mission.result}
              </pre>
            </div>
            <button
              onClick={() => dismissMission(mission.id)}
              className="mt-2 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Fermer la mission
            </button>
          </section>
        )}

        {/* ─── Error ─── */}
        {mission?.status === "failed" && mission.error && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-red-400/80">
              Erreur
            </h3>
            <div className="rounded-lg border border-red-900/40 bg-red-950/20 p-3">
              <p className="text-xs text-red-300">{mission.error}</p>
            </div>
            <button
              onClick={() => dismissMission(mission.id)}
              className="mt-2 text-[10px] text-zinc-600 transition-colors hover:text-zinc-400"
            >
              Fermer
            </button>
          </section>
        )}

        {/* ─── Mission ─── */}
        {hasMission && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Mission
            </h3>
            <div className="rounded-lg border border-zinc-800/50 bg-zinc-900/40 p-3">
              <p className="text-sm font-medium text-white">{mission.title}</p>
              <p className={`mt-1 text-xs ${MISSION_STATUS_LABEL[mission.status]?.color ?? "text-zinc-400"}`}>
                {MISSION_STATUS_LABEL[mission.status]?.label ?? mission.status}
              </p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                  style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : "0%" }}
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">
                {doneCount}/{totalCount} étapes terminées
              </p>
              {isRunning && (
                <button
                  onClick={() => cancelMission(mission.id)}
                  className="mt-2 text-[10px] text-red-500/60 transition-colors hover:text-red-400"
                >
                  Annuler
                </button>
              )}
            </div>
          </section>
        )}

        {/* ─── Actions timeline ─── */}
        {hasMission && mission.actions.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Étapes
            </h3>
            <div className="space-y-0.5">
              {mission.actions.map((action, i) => (
                <div key={action.id} className="flex items-start gap-2.5 py-1.5">
                  <div className="flex flex-col items-center">
                    <span className="mt-0.5 shrink-0 text-sm">{STATUS_ICON[action.status]}</span>
                    {i < mission.actions.length - 1 && (
                      <div className="mt-1 h-4 w-px bg-zinc-800" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className={`text-xs ${action.status === "waiting" ? "text-zinc-600" : "text-zinc-300"}`}>
                      {action.label}
                    </p>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-zinc-600">
                        {STATUS_LABEL[action.status]}
                      </span>
                      {action.service && (
                        <span className="text-[10px] text-zinc-700">via {action.service}</span>
                      )}
                    </div>
                    {action.preview && action.status === "done" && (
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{action.preview}</p>
                    )}
                    {action.error && action.status === "error" && (
                      <p className="mt-0.5 truncate text-[10px] text-red-400/70">{action.error}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ─── Services ─── */}
        {hasMission && mission.services.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Services utilisés
            </h3>
            <div className="flex flex-wrap gap-1.5">
              {mission.services.map((s) => (
                <span
                  key={s}
                  className="rounded-full border border-zinc-800 bg-zinc-900/60 px-2.5 py-0.5 text-[10px] text-zinc-400"
                >
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* ─── Background missions ─── */}
        {backgroundMissions.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Autres missions
            </h3>
            <div className="space-y-1">
              {backgroundMissions.map((m) => (
                <button
                  key={m.id}
                  onClick={() => setActiveMission(m.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-all duration-200 hover:bg-zinc-900/60"
                >
                  <span className="text-sm">
                    {m.status === "running" ? STATUS_ICON.in_progress : STATUS_ICON.needs_approval}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-zinc-400">{m.title}</p>
                    <p className="text-[10px] text-zinc-600">
                      {MISSION_STATUS_LABEL[m.status]?.label ?? m.status}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </section>
        )}

        {/* ─── Recent missions (when no active mission) ─── */}
        {!hasMission && !missionsLoading && recentMissions.length > 0 && (
          <section className="mb-5">
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Dernières missions
            </h3>
            <div className="space-y-1">
              {recentMissions.slice(0, 5).map((m) => {
                const st = RECENT_STATUS[m.status] ?? RECENT_STATUS.created;
                return (
                  <div
                    key={m.id}
                    className="flex items-start gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-zinc-900/40"
                  >
                    <span className={`mt-0.5 text-xs ${st.color}`}>{st.icon}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs text-zinc-300">{m.title}</p>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] ${st.color}`}>{st.label}</span>
                        <span className="text-[10px] text-zinc-700">{timeAgo(m.updated_at)}</span>
                      </div>
                      {m.status === "completed" && m.result && (
                        <p className="mt-0.5 line-clamp-2 text-[10px] text-zinc-500">
                          {m.result.slice(0, 120)}
                        </p>
                      )}
                      {m.status === "failed" && m.error && (
                        <p className="mt-0.5 truncate text-[10px] text-red-400/60">
                          {m.error}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* ─── Connected services (when no mission) ─── */}
        {!hasMission && (
          <section>
            <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Services connectés
            </h3>
            {servicesLoading ? (
              <div className="space-y-1">
                {[1, 2].map((i) => (
                  <div key={i} className="flex animate-pulse items-center gap-2 px-1 py-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-zinc-800" />
                    <span className="h-3 w-20 rounded bg-zinc-800" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-1">
                {CORE_SERVICES.map((s) => {
                  const connected = isConnected(s.id);
                  return (
                    <div key={s.id} className="flex items-center gap-2 px-1 py-1.5">
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-700"}`}
                      />
                      <span className="text-xs text-zinc-400">{s.label}</span>
                      <span className="ml-auto text-[10px] text-zinc-600">
                        {connected ? "Connecté" : "Non configuré"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </div>
    </aside>
  );
}
