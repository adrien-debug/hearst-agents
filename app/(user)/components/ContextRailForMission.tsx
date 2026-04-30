"use client";

/**
 * ContextRailForMission — Rail droit pour le Stage "mission".
 *
 * Affiche le contexte d'une mission planifiée :
 *  - Header avec nom + statut (pill colorée selon enabled/opsStatus)
 *  - Actions (Run now, Éditer, Activer/Désactiver, Modifier cadence,
 *    Dupliquer, Supprimer avec confirmation inline)
 *  - Liste des 5 derniers runs filtrés par missionId
 *  - Threads liés (déduits des runs)
 *
 * Toutes les actions sont câblées sur les endpoints v2 :
 *  - POST /api/v2/missions/[id]/run
 *  - PATCH /api/v2/missions/[id]
 *  - DELETE /api/v2/missions/[id]
 *  - POST /api/v2/missions (pour duplication)
 */

import { useEffect, useState, useCallback } from "react";
import { useStageStore } from "@/stores/stage";
import type { MissionLike } from "@/lib/ui/focal-mappers";

interface RunSummary {
  id: string;
  missionId?: string;
  status: string;
  createdAt: number;
  completedAt?: number;
  input?: string;
}

const TIME_FORMATTER = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

export function ContextRailForMission() {
  const current = useStageStore((s) => s.current);
  const setStageMode = useStageStore((s) => s.setMode);
  const back = useStageStore((s) => s.back);

  const missionId = current.mode === "mission" ? current.missionId : "";

  const [mission, setMission] = useState<MissionLike | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [missionError, setMissionError] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingCadence, setEditingCadence] = useState(false);
  const [cadenceDraft, setCadenceDraft] = useState("");

  // ── Chargement de la mission ─────────────────────────────────
  const loadMission = useCallback(() => {
    if (!missionId) {
      setMissionLoading(false);
      setMissionError("Mission introuvable");
      return;
    }
    setMissionLoading(true);
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
          setMissionError("Mission introuvable");
          setMission(null);
        } else {
          setMission(found);
          setMissionError(null);
          setCadenceDraft(found.schedule ?? found.frequency ?? "");
        }
      })
      .catch((err) => {
        setMissionError(err instanceof Error ? err.message : "Erreur");
      })
      .finally(() => {
        setMissionLoading(false);
      });
  }, [missionId]);

  // ── Chargement des runs filtrés ──────────────────────────────
  const loadRuns = useCallback(() => {
    if (!missionId) return;
    setRunsLoading(true);
    fetch(`/api/v2/runs?limit=50`, { credentials: "include" })
      .then(async (r) => (r.ok ? r.json() : { runs: [] }))
      .then((data) => {
        const all = (data?.runs as RunSummary[] | undefined) ?? [];
        const filtered = all
          .filter((r) => r.missionId === missionId)
          .slice(0, 5);
        setRuns(filtered);
      })
      .catch(() => setRuns([]))
      .finally(() => setRunsLoading(false));
  }, [missionId]);

  useEffect(() => {
    loadMission();
    loadRuns();
  }, [loadMission, loadRuns]);

  // ── Actions ──────────────────────────────────────────────────

  const callApi = async (
    label: string,
    fn: () => Promise<Response>,
  ): Promise<boolean> => {
    setPendingAction(label);
    setLastError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        const text = await res.text();
        setLastError(`${label}: ${text || res.status}`);
        return false;
      }
      return true;
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setPendingAction(null);
    }
  };

  const handleRunNow = async () => {
    const ok = await callApi("run", () =>
      fetch(`/api/v2/missions/${missionId}/run`, {
        method: "POST",
        credentials: "include",
      }),
    );
    if (ok) loadRuns();
  };

  const handleToggleEnabled = async () => {
    if (!mission) return;
    const next = !mission.enabled;
    const ok = await callApi("toggle", () =>
      fetch(`/api/v2/missions/${missionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      }),
    );
    if (ok) loadMission();
  };

  const handleSaveCadence = async () => {
    const trimmed = cadenceDraft.trim();
    if (!trimmed) return;
    const ok = await callApi("cadence", () =>
      fetch(`/api/v2/missions/${missionId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frequency: "custom", customCron: trimmed }),
      }),
    );
    if (ok) {
      setEditingCadence(false);
      loadMission();
    }
  };

  const handleDuplicate = async () => {
    if (!mission) return;
    setPendingAction("duplicate");
    setLastError(null);
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
      if (!res.ok) {
        setLastError(`duplicate: ${res.status}`);
        return;
      }
      const data = await res.json();
      const newId = data?.mission?.id;
      if (newId) {
        setStageMode({ mode: "mission", missionId: newId });
      }
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      setPendingAction(null);
    }
  };

  const handleDelete = async () => {
    const ok = await callApi("delete", () =>
      fetch(`/api/v2/missions/${missionId}`, {
        method: "DELETE",
        credentials: "include",
      }),
    );
    if (ok) {
      setConfirmDelete(false);
      back();
    }
  };

  const handleEdit = () => {
    // L'éditeur de mission vit dans MissionStage pour l'instant — on switche
    // sur le mode mission (qui rend MissionStage avec son éditeur inline).
    // L'agent UI peut câbler plus tard une modale dédiée si besoin.
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("mission:edit", { detail: { id: missionId } }),
      );
    }
  };

  // ── Rendu ────────────────────────────────────────────────────

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
    <div className="h-full overflow-y-auto">
      {/* Header mission */}
      <section className="px-6 py-6">
        <header className="flex items-center justify-between mb-4">
          <span className="rail-section-label">Mission</span>
          <span
            className="t-9 tracking-display uppercase font-mono"
            style={{ color: statusColor }}
            data-testid="mission-rail-status"
          >
            {String(status).toUpperCase()}
          </span>
        </header>
        {missionLoading ? (
          <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
            Chargement…
          </p>
        ) : missionError ? (
          <p
            className="t-10 tracking-body uppercase font-light"
            style={{ color: "var(--danger)" }}
          >
            {missionError}
          </p>
        ) : (
          <p className="t-13 font-light text-[var(--text-soft)] truncate">
            {mission?.name ?? "—"}
          </p>
        )}
      </section>

      {lastError && (
        <div
          className="mx-6 mb-4 border-l-2 border-[var(--danger)] px-3 py-2"
          style={{ background: "var(--surface-1)" }}
        >
          <p className="t-10 tracking-wide uppercase text-[var(--danger)] font-mono">
            {lastError}
          </p>
        </div>
      )}

      {/* Actions */}
      <section className="px-6 py-6">
        <header className="flex items-center justify-between mb-4">
          <span className="rail-section-label">Actions</span>
        </header>
        <div className="flex flex-col" style={{ gap: "var(--space-2)" }}>
          <RailActionButton
            label="Run now"
            primary
            disabled={!mission || pendingAction !== null}
            loading={pendingAction === "run"}
            onClick={handleRunNow}
            testId="mission-rail-action-run"
          />
          <RailActionButton
            label="Éditer"
            disabled={!mission || pendingAction !== null}
            onClick={handleEdit}
            testId="mission-rail-action-edit"
          />
          <RailActionButton
            label={mission?.enabled ? "Désactiver" : "Activer"}
            disabled={!mission || pendingAction !== null}
            loading={pendingAction === "toggle"}
            onClick={handleToggleEnabled}
            testId="mission-rail-action-toggle"
          />
          <RailActionButton
            label="Dupliquer"
            disabled={!mission || pendingAction !== null}
            loading={pendingAction === "duplicate"}
            onClick={handleDuplicate}
            testId="mission-rail-action-duplicate"
          />

          {/* Cadence éditable inline */}
          {editingCadence ? (
            <div
              className="flex flex-col"
              style={{
                gap: "var(--space-2)",
                padding: "var(--space-3) var(--space-4)",
                border: "1px solid var(--border-shell)",
                background: "var(--surface-card)",
              }}
            >
              <label className="t-9 tracking-display uppercase text-[var(--text-faint)]">
                Cadence (cron)
              </label>
              <input
                type="text"
                value={cadenceDraft}
                onChange={(e) => setCadenceDraft(e.target.value)}
                placeholder="0 9 * * *"
                className="ghost-input-line w-full font-mono t-11"
                data-testid="mission-rail-cadence-input"
                autoFocus
              />
              <div className="flex" style={{ gap: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={handleSaveCadence}
                  disabled={
                    pendingAction === "cadence" || !cadenceDraft.trim()
                  }
                  className="ghost-btn-solid ghost-btn-cykan flex-1 t-9"
                  data-testid="mission-rail-cadence-save"
                >
                  {pendingAction === "cadence" ? "…" : "OK"}
                </button>
                <button
                  type="button"
                  onClick={() => setEditingCadence(false)}
                  className="ghost-btn-solid ghost-btn-ghost flex-1 t-9"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <RailActionButton
              label="Modifier cadence"
              disabled={!mission || pendingAction !== null}
              onClick={() => setEditingCadence(true)}
              testId="mission-rail-action-cadence"
            />
          )}

          {/* Suppression avec confirmation inline */}
          {confirmDelete ? (
            <div
              className="flex flex-col"
              style={{
                gap: "var(--space-2)",
                padding: "var(--space-3) var(--space-4)",
                border: "1px solid var(--danger)",
                background: "var(--surface-card)",
              }}
            >
              <p className="t-11 font-light text-[var(--text-soft)]">
                Confirmer la suppression ?
              </p>
              <div className="flex" style={{ gap: "var(--space-2)" }}>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={pendingAction === "delete"}
                  className="ghost-btn-solid flex-1 t-9"
                  style={{
                    background: "var(--danger)",
                    color: "var(--bg)",
                    borderColor: "var(--danger)",
                  }}
                  data-testid="mission-rail-action-delete-confirm"
                >
                  {pendingAction === "delete" ? "…" : "Supprimer"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="ghost-btn-solid ghost-btn-ghost flex-1 t-9"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <RailActionButton
              label="Supprimer"
              danger
              disabled={!mission || pendingAction !== null}
              onClick={() => setConfirmDelete(true)}
              testId="mission-rail-action-delete"
            />
          )}
        </div>
      </section>

      {/* Derniers runs */}
      <section className="px-6 py-6">
        <header className="flex items-center justify-between mb-4">
          <span className="rail-section-label">Derniers runs</span>
          <span className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
            {runs.length.toString().padStart(2, "0")}
          </span>
        </header>
        {runsLoading ? (
          <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
            Chargement…
          </p>
        ) : runs.length === 0 ? (
          <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
            Aucun run pour cette mission
          </p>
        ) : (
          <ul className="flex flex-col" style={{ gap: "var(--space-3)" }}>
            {runs.map((r) => (
              <li
                key={r.id}
                className="border-l border-[var(--cykan-border)] pl-4 py-1"
              >
                <p className="t-11 font-light text-[var(--text-soft)] truncate">
                  {TIME_FORMATTER.format(new Date(r.createdAt))}
                </p>
                <p className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
                  {r.status?.toUpperCase() ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Threads liés (déduits des runs) */}
      <section className="px-6 py-6">
        <header className="flex items-center justify-between mb-4">
          <span className="rail-section-label">Threads liés</span>
          <span className="t-9 tracking-display uppercase text-[var(--text-ghost)]">
            {runs.length.toString().padStart(2, "0")}
          </span>
        </header>
        {runs.length === 0 ? (
          <p className="t-10 tracking-body uppercase text-[var(--text-ghost)] font-light">
            Aucun thread associé
          </p>
        ) : (
          <ul className="flex flex-col" style={{ gap: "var(--space-2)" }}>
            {runs.slice(0, 3).map((r) => (
              <li key={r.id}>
                <p className="t-11 font-light text-[var(--text-faint)] truncate">
                  Run · {r.id.slice(0, 8)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ── Sous-composant : bouton d'action homogène ──────────────

interface RailActionButtonProps {
  label: string;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
  loading?: boolean;
  testId?: string;
}

function RailActionButton({
  label,
  onClick,
  primary,
  danger,
  disabled,
  loading,
  testId,
}: RailActionButtonProps) {
  const variantClass = primary
    ? "ghost-btn-cykan"
    : danger
      ? "ghost-btn-ghost"
      : "ghost-btn-ghost";

  const dangerStyle = danger
    ? { color: "var(--danger)", borderColor: "var(--border-shell)" }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className={`ghost-btn-solid ${variantClass} w-full t-11 justify-start`}
      style={dangerStyle}
      data-testid={testId}
      aria-label={label}
    >
      <span className="tracking-wide uppercase">
        {loading ? "…" : label}
      </span>
    </button>
  );
}
