"use client";

/**
 * ContextRailForMission — Rail droit pour le Stage "mission".
 *
 * Refonte 2026-04-30 (Phase 4 — Lot 2) : single source of truth pour les
 * actions = StageActionBar dans le header. Le rail ne montre plus que du
 * contexte (titre, statut, prompt, cadence, derniers runs, threads liés).
 *
 * Affiche :
 *  - Header avec nom + statut (pill colorée selon enabled/opsStatus)
 *  - Prompt + cadence en lecture seule
 *  - Liste des 5 derniers runs filtrés par missionId
 *  - Threads liés (déduits des runs)
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

  const missionId = current.mode === "mission" ? current.missionId : "";

  const [mission, setMission] = useState<MissionLike | null>(null);
  const [missionLoading, setMissionLoading] = useState(true);
  const [missionError, setMissionError] = useState<string | null>(null);

  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loaders async qui setState après await réseau, pas en cascade synchrone
    loadMission();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- idem
    loadRuns();
  }, [loadMission, loadRuns]);

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

  const cadence = mission?.schedule ?? mission?.frequency ?? null;
  const promptText = mission?.input ?? mission?.description ?? null;

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

      {/* Prompt */}
      {promptText && (
        <section className="px-6 py-6">
          <header className="flex items-center justify-between mb-4">
            <span className="rail-section-label">Prompt</span>
          </header>
          <p
            className="t-11 font-light text-[var(--text-muted)]"
            style={{ lineHeight: "var(--leading-relaxed)" }}
          >
            {promptText}
          </p>
        </section>
      )}

      {/* Cadence */}
      {cadence && (
        <section className="px-6 py-6">
          <header className="flex items-center justify-between mb-4">
            <span className="rail-section-label">Cadence</span>
          </header>
          <p className="t-11 font-mono text-[var(--text-faint)]">{cadence}</p>
        </section>
      )}

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
