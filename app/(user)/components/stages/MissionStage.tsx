"use client";

import { useEffect, useState, useCallback } from "react";
import { useStageStore } from "@/stores/stage";
import { StageActionBar, type StageAction } from "./StageActionBar";
import { ConfirmModal } from "../ConfirmModal";
import { MissionStepGraph } from "../MissionStepGraph";
import { useRuntimeStore } from "@/stores/runtime";
import type { MissionLike } from "@/lib/ui/focal-mappers";

interface MissionStageProps {
  missionId: string;
}

interface RunSummary {
  id: string;
  missionId?: string;
  status: string;
  createdAt: number;
  completedAt?: number;
}

const FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function MissionStage({ missionId }: MissionStageProps) {
  const back = useStageStore((s) => s.back);
  const setStageMode = useStageStore((s) => s.setMode);
  const currentPlan = useRuntimeStore((s) => s.currentPlan);

  const [mission, setMission] = useState<MissionLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCadence, setEditingCadence] = useState(false);
  const [cadenceDraft, setCadenceDraft] = useState("");

  // ── Load mission ─────────────────────────────────────────────
  const loadMission = useCallback(() => {
    if (!missionId) {
      setLoading(false);
      setError("Mission introuvable");
      return;
    }
    setLoading(true);
    fetch(`/api/v2/missions`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        const found = (data?.missions as MissionLike[] | undefined)?.find(
          (m) => m.id === missionId,
        );
        if (!found) {
          setError("Mission introuvable");
          setMission(null);
        } else {
          setMission(found);
          setError(null);
          setCadenceDraft(found.schedule ?? found.frequency ?? "");
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [missionId]);

  // ── Load runs filtered by missionId ──────────────────────────
  const loadRuns = useCallback(() => {
    if (!missionId) return;
    fetch(`/api/v2/runs?limit=50`, { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : { runs: [] }))
      .then((data) => {
        const all = (data?.runs as RunSummary[] | undefined) ?? [];
        setRuns(all.filter((r) => r.missionId === missionId).slice(0, 5));
      })
      .catch(() => setRuns([]));
  }, [missionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loaders async qui setState après await réseau, pas en cascade synchrone
    loadMission();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- idem
    loadRuns();
  }, [loadMission, loadRuns]);

  // ── Actions ──────────────────────────────────────────────────
  const handleRunNow = async () => {
    setPendingAction("run");
    try {
      await fetch(`/api/v2/missions/${missionId}/run`, {
        method: "POST",
        credentials: "include",
      });
      loadRuns();
      loadMission();
    } finally {
      setPendingAction(null);
    }
  };

  const handleToggleEnabled = async () => {
    if (!mission) return;
    setPendingAction("toggle");
    try {
      await fetch(`/api/v2/missions/${missionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !mission.enabled }),
      });
      loadMission();
    } finally {
      setPendingAction(null);
    }
  };

  const handleDuplicate = async () => {
    if (!mission) return;
    setPendingAction("duplicate");
    try {
      const res = await fetch(`/api/v2/missions`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${mission.name} (copie)`,
          input: mission.input ?? mission.description ?? "",
          schedule: mission.schedule ?? "0 9 * * *",
          enabled: false,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const newId = data?.mission?.id;
        if (newId) setStageMode({ mode: "mission", missionId: newId });
      }
    } finally {
      setPendingAction(null);
    }
  };

  const handleSaveCadence = async () => {
    const trimmed = cadenceDraft.trim();
    if (!trimmed) return;
    setPendingAction("cadence");
    try {
      await fetch(`/api/v2/missions/${missionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: "custom", customCron: trimmed }),
      });
      setEditingCadence(false);
      loadMission();
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async () => {
    setPendingAction("delete");
    try {
      const res = await fetch(`/api/v2/missions/${missionId}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (res.ok) {
        setConfirmDelete(false);
        back();
      }
    } finally {
      setPendingAction(null);
    }
  };

  // ── Listen for mission:edit dispatched from rail ─────────────
  useEffect(() => {
    const onEdit = () => setEditingCadence(true);
    window.addEventListener("mission:edit", onEdit);
    return () => window.removeEventListener("mission:edit", onEdit);
  }, []);

  const status = mission?.opsStatus ?? (mission?.enabled ? "active" : "paused");
  const statusColor =
    status === "running"
      ? "var(--cykan)"
      : status === "failed"
        ? "var(--danger)"
        : status === "active"
          ? "var(--cykan)"
          : "var(--text-faint)";

  return (
    <div
      className="flex-1 flex flex-col min-h-0 relative"
      style={{ background: "var(--bg-center)" }}
    >
      {(() => {
        const primary: StageAction = {
          id: "run",
          label: "Run now",
          onClick: () => void handleRunNow(),
          disabled: !mission || pendingAction !== null,
          loading: pendingAction === "run",
        };
        const secondary: StageAction[] = [
          {
            id: "edit",
            label: "Éditer",
            onClick: () => setEditingCadence(true),
            disabled: !mission || pendingAction !== null,
          },
          {
            id: "toggle",
            label: mission?.enabled ? "Désactiver" : "Activer",
            onClick: () => void handleToggleEnabled(),
            disabled: !mission || pendingAction !== null,
            loading: pendingAction === "toggle",
          },
        ];
        const overflow: StageAction[] = [
          {
            id: "duplicate",
            label: "Dupliquer",
            onClick: () => void handleDuplicate(),
            disabled: pendingAction !== null,
          },
          {
            id: "cadence",
            label: "Modifier cadence",
            onClick: () => setEditingCadence(true),
            disabled: pendingAction !== null,
          },
          {
            id: "delete",
            label: "Supprimer",
            variant: "danger",
            onClick: () => setConfirmDelete(true),
            disabled: pendingAction !== null,
          },
        ];
        return (
          <StageActionBar
            context={
              <>
                <span className="t-11 font-light text-[var(--text-faint)]">
                  MISSION
                </span>
                <span
                  className="rounded-pill bg-[var(--text-ghost)]"
                  style={{ width: "var(--space-1)", height: "var(--space-1)" }}
                />
                <span className="t-11 font-light text-[var(--text-muted)]">
                  {missionId.slice(0, 8)}
                </span>
                {mission && (
                  <>
                    <span
                      className="rounded-pill bg-[var(--text-ghost)]"
                      style={{ width: "var(--space-1)", height: "var(--space-1)" }}
                    />
                    <span
                      className="t-11 font-medium"
                      style={{ color: statusColor }}
                    >
                      {String(status).toUpperCase()}
                    </span>
                  </>
                )}
              </>
            }
            primary={primary}
            secondary={secondary}
            overflow={overflow}
            onBack={back}
          />
        );
      })()}

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-12 py-12 min-h-full">
          {loading && (
            <div
              className="flex flex-col items-center justify-center py-24"
              style={{ rowGap: "var(--space-4)" }}
            >
              <span
                className="rounded-pill bg-[var(--cykan)] animate-pulse halo-cyan-sm"
                style={{ width: "var(--space-2)", height: "var(--space-2)" }}
                aria-hidden
              />
              <p className="t-11 font-light text-[var(--text-faint)]">
                Chargement de la mission…
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="border-l-2 border-[var(--danger)] px-4 py-3"
              style={{ background: "var(--surface-1)" }}
            >
              <p className="t-11 font-medium text-[var(--danger)]">
                ERREUR · {error}
              </p>
            </div>
          )}

          {/* Mission Control B1 — StepGraph live au-dessus, ne casse pas l'existant. */}
          {currentPlan && !loading && (
            <div style={{ marginBottom: "var(--space-8)" }}>
              <MissionStepGraph plan={currentPlan} />
            </div>
          )}

          {mission && !loading && (
            <>
              <h1
                className="t-28 font-medium tracking-tight text-[var(--text)]"
                style={{
                  lineHeight: "var(--leading-snug)",
                  marginBottom: "var(--space-3)",
                }}
              >
                {mission.name}
              </h1>

              <div className="flex items-center gap-3 mb-10 t-11 font-light text-[var(--text-faint)]">
                {mission.schedule && <span>{mission.schedule}</span>}
                {mission.frequency && !mission.schedule && (
                  <span>{mission.frequency}</span>
                )}
                {mission.lastRunAt && (
                  <>
                    <span
                      className="rounded-pill bg-[var(--text-ghost)]"
                      style={{
                        width: "var(--space-1)",
                        height: "var(--space-1)",
                      }}
                    />
                    <span>
                      Dernier run · {FORMATTER.format(new Date(mission.lastRunAt))}
                    </span>
                  </>
                )}
              </div>

              {(mission.input || mission.description) && (
                <div className="mb-10">
                  <p
                    className="t-11 font-light mb-3"
                    style={{ color: "var(--text-l2)" }}
                  >
                    Prompt
                  </p>
                  <p className="t-15 leading-[1.7] font-light text-[var(--text-muted)] whitespace-pre-wrap">
                    {mission.input ?? mission.description}
                  </p>
                </div>
              )}

              {/* Inline cadence editor */}
              {editingCadence && (
                <div
                  className="mb-10"
                  style={{
                    padding: "var(--space-4)",
                    border: "1px solid var(--border-shell)",
                    background: "var(--surface-card)",
                  }}
                >
                  <label className="t-11 font-light text-[var(--text-faint)] block mb-3">
                    Cadence (cron)
                  </label>
                  <input
                    type="text"
                    value={cadenceDraft}
                    onChange={(e) => setCadenceDraft(e.target.value)}
                    placeholder="0 9 * * *"
                    className="ghost-input-line w-full font-mono t-13"
                    data-testid="mission-stage-cadence-input"
                  />
                  <div
                    className="flex mt-4"
                    style={{ gap: "var(--space-2)" }}
                  >
                    <button
                      type="button"
                      onClick={handleSaveCadence}
                      disabled={pendingAction === "cadence" || !cadenceDraft.trim()}
                      className="ghost-btn-solid ghost-btn-cykan t-9"
                      data-testid="mission-stage-cadence-save"
                    >
                      <span className="tracking-wide uppercase">
                        {pendingAction === "cadence" ? "…" : "Enregistrer"}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingCadence(false)}
                      className="ghost-btn-solid ghost-btn-ghost t-9"
                    >
                      <span className="tracking-wide uppercase">Annuler</span>
                    </button>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-[var(--border-default)]">
                <Stat label="Statut" value={String(status)} />
                <Stat label="Activée" value={mission.enabled ? "Oui" : "Non"} />
                <Stat
                  label="Fréquence"
                  value={mission.schedule ?? mission.frequency ?? "—"}
                />
              </div>

              {/* Derniers runs */}
              {/* The ConfirmModal lives below the scroll container so the
                  backdrop overlays the entire stage. */}
              <div className="mt-12 pt-8 border-t border-[var(--border-default)]">
                <p
                  className="t-11 font-light mb-4"
                  style={{ color: "var(--text-l2)" }}
                >
                  Derniers runs · {runs.length.toString().padStart(2, "0")}
                </p>
                {runs.length === 0 ? (
                  <p className="t-11 font-light text-[var(--text-faint)]">
                    Aucun run enregistré pour cette mission.
                  </p>
                ) : (
                  <ul className="flex flex-col" style={{ gap: "var(--space-3)" }}>
                    {runs.map((r) => {
                      const duration =
                        r.completedAt && r.createdAt
                          ? Math.round((r.completedAt - r.createdAt) / 1000)
                          : null;
                      const statusUp = r.status?.toUpperCase() ?? "—";
                      const statusCol =
                        r.status === "completed" || r.status === "success"
                          ? "var(--cykan)"
                          : r.status === "failed"
                            ? "var(--danger)"
                            : "var(--text-faint)";
                      return (
                        <li
                          key={r.id}
                          className="flex items-center justify-between py-2 border-b border-[var(--border-shell)]"
                        >
                          <div className="flex items-center" style={{ gap: "var(--space-3)" }}>
                            <span
                              className="t-11 font-medium"
                              style={{ color: statusCol }}
                            >
                              {statusUp}
                            </span>
                            <span className="t-11 font-light text-[var(--text-soft)]">
                              {FORMATTER.format(new Date(r.createdAt))}
                            </span>
                            {duration !== null && (
                              <span className="t-9 font-mono text-[var(--text-faint)]">
                                {duration}s
                              </span>
                            )}
                          </div>
                          <span className="t-9 font-mono text-[var(--text-faint)]">
                            {r.id.slice(0, 8)}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmDelete}
        title="Supprimer cette mission ?"
        description={`La mission « ${mission?.name ?? missionId.slice(0, 8)} » et son planning seront supprimés. Les runs passés sont conservés.`}
        confirmLabel="Supprimer"
        variant="danger"
        loading={pendingAction === "delete"}
        onConfirm={() => void handleDelete()}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-11 font-light text-[var(--text-faint)]">
        {label}
      </span>
      <span className="t-15 font-light text-[var(--text)]">{value}</span>
    </div>
  );
}
