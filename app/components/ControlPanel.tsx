"use client";

import { useState } from "react";
import { useMission, cancelMission, approveMission } from "../lib/missions";
import { useConnectedServices } from "../hooks/use-connected-services";
import { useRecentMissions, type RecentMission } from "../hooks/use-recent-missions";

function StepIcon({ status }: { status: string }) {
  switch (status) {
    case "done":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/15">
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-emerald-400">
            <path d="M4 8.5l2.5 2.5L12 5" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      );
    case "in_progress":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cyan-500/15">
          <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />
        </span>
      );
    case "error":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500/15">
          <svg viewBox="0 0 16 16" fill="none" className="h-3 w-3 text-red-400">
            <path d="M5 5l6 6M11 5l-6 6" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
          </svg>
        </span>
      );
    case "needs_approval":
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-500/15">
          <span className="h-2 w-2 rounded-sm bg-amber-400" />
        </span>
      );
    default:
      return (
        <span className="flex h-5 w-5 items-center justify-center rounded-full">
          <span className="h-2 w-2 rounded-full bg-zinc-700" />
        </span>
      );
  }
}

const STATUS_LABEL: Record<string, string> = {
  done: "Terminé",
  in_progress: "En cours…",
  waiting: "",
  error: "Erreur",
  needs_approval: "Validation requise",
};

const MISSION_STATUS_LABEL: Record<string, { label: string; color: string }> = {
  created: { label: "Préparation…", color: "text-cyan-400" },
  running: { label: "En cours…", color: "text-cyan-400" },
  awaiting_approval: { label: "Validation requise", color: "text-amber-400" },
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
  const [approving, setApproving] = useState(false);

  const hasMission = !!mission;
  const doneCount = mission?.actions.filter((a) => a.status === "done").length ?? 0;
  const totalCount = mission?.actions.length ?? 0;
  const isRunning = mission?.status === "running" || mission?.status === "created";
  const isAwaiting = mission?.status === "awaiting_approval";

  return (
    <aside className="hidden h-full w-[320px] shrink-0 flex-col border-l border-zinc-800/50 bg-zinc-950/95 lg:flex">
      <div className="flex-1 overflow-y-auto p-4">
        {/* ─── Awaiting approval (primary) ─── */}
        {isAwaiting && mission?.result && (
          <section className="mb-5">
            <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-amber-400/80">
              Résultat prêt
            </h3>
            <div className="rounded-lg border border-amber-900/30 bg-amber-950/10 p-3">
              <pre className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                {mission.result}
              </pre>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <button
                onClick={async () => {
                  setApproving(true);
                  await approveMission(mission.id);
                  setApproving(false);
                }}
                disabled={approving}
                className="rounded-md bg-cyan-500 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-cyan-400 active:scale-[0.97] disabled:opacity-50"
              >
                {approving ? "Envoi…" : "Envoyer"}
              </button>
              <button
                onClick={() => dismissMission(mission.id)}
                className="rounded-md border border-zinc-800 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-700 hover:text-zinc-200"
              >
                Annuler
              </button>
            </div>
          </section>
        )}

        {/* ─── Result (completed missions) ─── */}
        {mission?.status === "completed" && mission?.result && (
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
              <div className="flex items-center gap-2">
                {isRunning && <span className="h-2 w-2 animate-pulse rounded-full bg-cyan-400" />}
                {mission.status === "completed" && <span className="h-2 w-2 rounded-full bg-emerald-400" />}
                {mission.status === "failed" && <span className="h-2 w-2 rounded-full bg-red-400" />}
                <p className="text-sm font-medium text-white">{mission.title}</p>
              </div>
              <p className={`mt-1 text-xs ${MISSION_STATUS_LABEL[mission.status]?.color ?? "text-zinc-400"}`}>
                {MISSION_STATUS_LABEL[mission.status]?.label ?? mission.status}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div
                  className={`h-full rounded-full transition-all duration-700 ease-out ${
                    mission.status === "completed" ? "bg-emerald-500" :
                    mission.status === "failed" ? "bg-red-500" :
                    "bg-cyan-500"
                  }`}
                  style={{ width: totalCount > 0 ? `${(doneCount / totalCount) * 100}%` : "0%" }}
                />
              </div>
              <p className="mt-1 text-[10px] text-zinc-600">
                {doneCount}/{totalCount}
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
            <div className="space-y-0">
              {mission.actions.map((action, i) => (
                <div key={action.id} className="flex items-start gap-2.5">
                  <div className="flex flex-col items-center">
                    <StepIcon status={action.status} />
                    {i < mission.actions.length - 1 && (
                      <div className={`h-5 w-px ${action.status === "done" ? "bg-emerald-500/20" : "bg-zinc-800/60"}`} />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 pb-3">
                    <p className={`text-xs leading-5 ${
                      action.status === "in_progress" ? "font-medium text-white" :
                      action.status === "done" ? "text-zinc-400" :
                      action.status === "waiting" ? "text-zinc-600" :
                      "text-zinc-300"
                    }`}>
                      {action.label}
                    </p>
                    {STATUS_LABEL[action.status] && (
                      <p className={`text-[10px] ${
                        action.status === "in_progress" ? "text-cyan-400" :
                        action.status === "error" ? "text-red-400" :
                        "text-zinc-600"
                      }`}>
                        {STATUS_LABEL[action.status]}
                      </p>
                    )}
                    {action.preview && action.status === "done" && (
                      <p className="mt-0.5 truncate text-[10px] text-zinc-500">{action.preview}</p>
                    )}
                    {action.error && action.status === "error" && (
                      <p className="mt-0.5 truncate text-[10px] text-red-400/60">{action.error}</p>
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
                  <StepIcon status={m.status === "running" ? "in_progress" : "needs_approval"} />
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
