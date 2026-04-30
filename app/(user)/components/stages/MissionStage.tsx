"use client";

import { useEffect, useState } from "react";
import { useStageStore } from "@/stores/stage";
import type { MissionLike } from "@/lib/ui/focal-mappers";

interface MissionStageProps {
  missionId: string;
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
  const [mission, setMission] = useState<MissionLike | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!missionId) {
      void Promise.resolve().then(() => {
        if (cancelled) return;
        setLoading(false);
        setError("Mission introuvable");
      });
      return;
    }
    fetch(`/api/v2/missions`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((data) => {
        if (cancelled) return;
        const found = (data?.missions as MissionLike[] | undefined)?.find(
          (m) => m.id === missionId,
        );
        if (!found) {
          setError("Mission introuvable");
          setMission(null);
        } else {
          setMission(found);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [missionId]);

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
    <div className="flex-1 flex flex-col min-h-0 relative" style={{ background: "var(--bg-center)" }}>
      <header className="flex items-center justify-between px-12 py-6 flex-shrink-0 relative z-10 border-b border-[var(--border-default)]">
        <div className="flex items-center gap-4">
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">MISSION</span>
          <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
          <span className="t-9 font-mono uppercase tracking-marquee text-[var(--text-muted)]">{missionId.slice(0, 8)}</span>
          {mission && (
            <>
              <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
              <span className="t-9 font-mono uppercase tracking-marquee" style={{ color: statusColor }}>
                {String(status).toUpperCase()}
              </span>
            </>
          )}
        </div>
        <button
          onClick={back}
          className="halo-on-hover inline-flex items-center gap-2 px-3 py-1.5 t-9 font-mono uppercase tracking-section border border-[var(--border-shell)] text-[var(--text-faint)] hover:text-[var(--cykan)] hover:border-[var(--cykan-border-hover)] transition-all shrink-0"
          title="Retour"
        >
          <span>Retour</span>
          <span className="opacity-60">⌘⌫</span>
        </button>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-12 py-12 min-h-full">
          {loading && (
            <div className="flex flex-col items-center justify-center py-24" style={{ rowGap: "var(--space-4)" }}>
              <span
                className="rounded-pill bg-[var(--cykan)] animate-pulse halo-cyan-sm"
                style={{ width: "var(--space-2)", height: "var(--space-2)" }}
                aria-hidden
              />
              <p className="t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">Chargement de la mission…</p>
            </div>
          )}

          {error && !loading && (
            <div className="border-l-2 border-[var(--danger)] bg-[var(--danger)]/5 px-4 py-3">
              <p className="t-9 font-mono uppercase tracking-marquee text-[var(--danger)]">ERREUR · {error}</p>
            </div>
          )}

          {mission && !loading && (
            <>
              <h1
                className="t-28 font-medium tracking-tight text-[var(--text)]"
                style={{ lineHeight: "var(--leading-snug)", marginBottom: "var(--space-3)" }}
              >
                {mission.name}
              </h1>

              <div className="flex items-center gap-3 mb-10 t-9 font-mono uppercase tracking-marquee text-[var(--text-faint)]">
                {mission.schedule && <span>{mission.schedule}</span>}
                {mission.frequency && !mission.schedule && <span>{mission.frequency}</span>}
                {mission.lastRunAt && (
                  <>
                    <span className="rounded-pill bg-[var(--text-ghost)]" style={{ width: "var(--space-1)", height: "var(--space-1)" }} />
                    <span>Dernier run · {FORMATTER.format(new Date(mission.lastRunAt))}</span>
                  </>
                )}
              </div>

              {(mission.input || mission.description) && (
                <div className="mb-10">
                  <p
                    className="t-9 font-mono uppercase tracking-display mb-3"
                    style={{ color: "var(--text-l2)" }}
                  >
                    Prompt
                  </p>
                  <p className="t-15 leading-[1.7] font-light text-[var(--text-muted)] whitespace-pre-wrap">
                    {mission.input ?? mission.description}
                  </p>
                </div>
              )}

              <div
                className="grid grid-cols-3 gap-6 mt-12 pt-8 border-t border-[var(--border-default)]"
              >
                <Stat label="Statut" value={String(status)} />
                <Stat label="Activée" value={mission.enabled ? "Oui" : "Non"} />
                <Stat
                  label="Fréquence"
                  value={mission.schedule ?? mission.frequency ?? "—"}
                />
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="t-9 font-mono uppercase tracking-display text-[var(--text-faint)]">
        {label}
      </span>
      <span className="t-15 font-light text-[var(--text)]">{value}</span>
    </div>
  );
}
