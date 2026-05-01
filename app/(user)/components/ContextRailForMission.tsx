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
            className="t-9 font-medium"
            style={{ color: statusColor }}
            data-testid="mission-rail-status"
          >
            {String(status)}
          </span>
        </header>
        {missionLoading ? (
          <p className="t-9 font-light text-[var(--text-ghost)] font-light">
            Chargement…
          </p>
        ) : missionError ? (
          <p
            className="t-9 font-light font-light"
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
          <span className="t-9 font-medium text-[var(--text-ghost)]">
            {runs.length.toString().padStart(2, "0")}
          </span>
        </header>
        {runsLoading ? (
          <p className="t-9 font-light text-[var(--text-ghost)] font-light">
            Chargement…
          </p>
        ) : runs.length === 0 ? (
          <p className="t-9 font-light text-[var(--text-ghost)] font-light">
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
                <p className="t-9 font-medium text-[var(--text-ghost)]">
                  {r.status ?? "—"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Mémoire de mission (vague 9) — 2 premières sections du
          contextSummary, snapshot rail. Le détail complet vit dans
          MissionConversation au centre du Stage. */}
      <MissionMemorySection missionId={missionId} />
    </div>
  );
}

interface MissionContextRailDto {
  summary: string | null;
  summaryUpdatedAt: number | null;
  recentMessages: Array<{ id: string }>;
}

const SUMMARY_CACHE_RAIL_FMT = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Paris",
});

function MissionMemorySection({ missionId }: { missionId: string }) {
  const [ctx, setCtx] = useState<MissionContextRailDto | null>(null);

  useEffect(() => {
    if (!missionId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/v2/missions/${missionId}/context`, {
        credentials: "include",
      }).catch(() => null);
      if (cancelled || !res || !res.ok) return;
      const data = (await res.json()) as { context: MissionContextRailDto };
      if (!cancelled) setCtx(data.context);
    })();
    return () => {
      cancelled = true;
    };
  }, [missionId]);

  const sections = ctx?.summary ? extractSummaryHeads(ctx.summary, 2) : [];
  const messageCount = ctx?.recentMessages.length ?? 0;

  return (
    <section className="px-6 py-6">
      <header className="flex items-center justify-between mb-4">
        <span className="rail-section-label">Mémoire</span>
        {messageCount > 0 && (
          <span className="t-9 font-medium text-[var(--text-ghost)]">
            {messageCount.toString().padStart(2, "0")} msg
          </span>
        )}
      </header>

      {sections.length === 0 ? (
        <p className="t-9 font-light text-[var(--text-ghost)] font-light">
          Pas encore de mémoire — lance une fois pour démarrer.
        </p>
      ) : (
        <div className="flex flex-col" style={{ gap: "var(--space-3)" }}>
          {sections.map((s, i) => (
            <div key={i} className="flex flex-col" style={{ gap: "var(--space-1)" }}>
              <span
                className="t-9 font-medium"
                style={{
                  color: "var(--text-l2)",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase",
                }}
              >
                {s.title}
              </span>
              <p
                className="t-11 font-light"
                style={{
                  color: "var(--text-soft)",
                  lineHeight: 1.45,
                }}
              >
                {s.body}
              </p>
            </div>
          ))}
          {ctx?.summaryUpdatedAt && (
            <span className="t-9 font-light text-[var(--text-faint)]">
              Mis à jour {SUMMARY_CACHE_RAIL_FMT.format(new Date(ctx.summaryUpdatedAt))}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

function extractSummaryHeads(
  summary: string,
  max: number,
): Array<{ title: string; body: string }> {
  const blocks = summary
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 0);

  const out: Array<{ title: string; body: string }> = [];
  for (const block of blocks) {
    const m = block.match(/^\*\*([^*]+?)\.\*\*\s*([\s\S]+)$/);
    if (m) {
      out.push({ title: m[1], body: m[2].length > 160 ? `${m[2].slice(0, 159)}…` : m[2] });
    }
    if (out.length >= max) break;
  }
  return out;
}
