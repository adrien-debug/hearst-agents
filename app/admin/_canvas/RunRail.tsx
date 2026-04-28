"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "./store";
import { fetchAdminJsonWithMeta } from "./safe-admin-fetch";

interface PersistedRun {
  id: string;
  input: string;
  status: "running" | "completed" | "failed";
  surface?: string;
  createdAt: number;
}

interface Props {
  onSelect: (runId: string) => void;
  /** Colonne runs dans le flux (sans largeur fixe — la colonne parent définit la largeur). */
  className?: string;
}

const STATUS_DOT: Record<PersistedRun["status"], string> = {
  running: "var(--warn)",
  completed: "var(--cykan)",
  failed: "var(--danger)",
};

export default function RunRail({ onSelect, className }: Props) {
  const [runs, setRuns] = useState<PersistedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedRunId = useCanvasStore((s) => s.selectedRunId);

  useEffect(() => {
    let cancelled = false;
    fetchAdminJsonWithMeta<{ runs: PersistedRun[] }>("/api/admin/runs/recent?limit=10").then((res) => {
      if (cancelled) return;
      setRuns(res.data?.runs ?? []);
      setError(res.error);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div
      className={[
        "flex flex-col min-h-0 flex-1 bg-bg-elev",
        className ?? "",
      ].join(" ")}
    >
      <header className="px-(--space-4) py-(--space-3) shrink-0 border-b border-line bg-surface">
        <p className="t-10 font-mono uppercase tracking-stretch text-text-faint">
          Derniers runs
        </p>
        <p className="t-9 font-mono uppercase tracking-(--tracking-caption) text-text-faint/70 mt-(--space-1)">
          {loading ? "chargement…" : `${runs.length} run${runs.length > 1 ? "s" : ""}`}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto min-h-0">
        {loading && (
          <div className="px-(--space-4) py-(--space-6) space-y-(--space-2)">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-(--space-12) rounded-(--radius-md) animate-pulse bg-(--surface-card)"
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="px-(--space-4) py-(--space-3) flex flex-col gap-(--space-2)">
            <p className="t-11 text-(--danger)/80">
              Erreur : {error}
            </p>
            <p className="t-10 text-text-faint">
              Vérifie ta session admin ou la connexion au serveur.
            </p>
          </div>
        )}

        {!loading && !error && runs.length === 0 && (
          <p className="px-(--space-4) py-(--space-3) t-11 text-text-muted">
            Aucun run encore. Envoie un message dans le chat pour en générer un.
          </p>
        )}

        {!loading && !error && runs.length > 0 && (
          <ul>
            {runs.map((run) => {
              const isSelected = selectedRunId === run.id;
              return (
                <li key={run.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(run.id)}
                    className={[
                      "w-full text-left px-(--space-4) py-(--space-3) border-b border-line transition-colors duration-(--duration-base) ease-(--ease-standard)",
                      isSelected
                        ? "bg-(--cykan-bg-active) border-l-2 border-l-(--cykan)"
                        : "hover:bg-bg-soft border-l-2 border-l-transparent",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-(--space-2) mb-(--space-1)">
                      <span
                        className="size-(--space-2) rounded-(--radius-full) shrink-0"
                        style={{ background: STATUS_DOT[run.status] }}
                      />
                      <span className="t-10 font-mono uppercase tracking-caption text-text-faint">
                        {run.status}
                      </span>
                      {run.surface && (
                        <span className="t-9 font-mono uppercase tracking-caption text-text-faint ml-auto">
                          {run.surface}
                        </span>
                      )}
                    </div>
                    <p className="t-11 text-text-soft line-clamp-2 leading-snug">
                      {run.input || "(message vide)"}
                    </p>
                    <p className="t-9 font-mono tracking-caption text-text-faint mt-(--space-1)">
                      {new Date(run.createdAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
