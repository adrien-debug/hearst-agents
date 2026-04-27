"use client";

import { useEffect, useState } from "react";
import { useCanvasStore } from "./store";

interface PersistedRun {
  id: string;
  input: string;
  status: "running" | "completed" | "failed";
  surface?: string;
  createdAt: number;
}

interface Props {
  onSelect: (runId: string) => void;
}

const STATUS_DOT: Record<PersistedRun["status"], string> = {
  running: "var(--warn)",
  completed: "var(--cykan)",
  failed: "var(--danger)",
};

async function safeJsonFetch<T>(url: string): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { data: null, error: `HTTP ${res.status}` };
    }
    const text = await res.text();
    if (!text) return { data: null, error: null };
    try {
      return { data: JSON.parse(text) as T, error: null };
    } catch {
      return { data: null, error: "réponse invalide" };
    }
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : "erreur réseau" };
  }
}

export default function RunRail({ onSelect }: Props) {
  const [runs, setRuns] = useState<PersistedRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const selectedRunId = useCanvasStore((s) => s.selectedRunId);

  useEffect(() => {
    let cancelled = false;
    safeJsonFetch<{ runs: PersistedRun[] }>("/api/admin/runs/recent?limit=10").then((res) => {
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
    <aside className="hidden lg:flex w-72 shrink-0 border-l border-[var(--line)] bg-[var(--bg-elev)] flex-col">
      <header className="px-4 py-3 border-b border-[var(--line)]">
        <p className="t-10 font-mono uppercase tracking-[0.18em] text-[var(--text-faint)]">
          Derniers runs
        </p>
        <p className="t-9 font-mono uppercase tracking-[0.12em] text-[var(--text-faint)]/60 mt-1">
          {loading ? "chargement…" : `${runs.length} run${runs.length > 1 ? "s" : ""}`}
        </p>
      </header>

      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="px-4 py-6 space-y-2">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="h-14 rounded-md animate-pulse"
                style={{ background: "rgba(255,255,255,0.03)" }}
              />
            ))}
          </div>
        )}

        {!loading && error && (
          <p className="px-4 py-3 t-11 text-[var(--text-faint)]">
            Pas de session admin valide. Reconnecte-toi pour voir les runs.
          </p>
        )}

        {!loading && !error && runs.length === 0 && (
          <p className="px-4 py-3 t-11 text-[var(--text-muted)]">
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
                      "w-full text-left px-4 py-3 border-b border-[var(--line)] transition-colors",
                      isSelected
                        ? "bg-[var(--cykan)]/8 border-l-2 border-l-[var(--cykan)]"
                        : "hover:bg-[var(--bg-soft)] border-l-2 border-l-transparent",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span
                        className="size-1.5 rounded-full shrink-0"
                        style={{ background: STATUS_DOT[run.status] }}
                      />
                      <span className="t-10 font-mono uppercase tracking-[0.1em] text-[var(--text-faint)]">
                        {run.status}
                      </span>
                      {run.surface && (
                        <span className="t-9 font-mono uppercase tracking-[0.1em] text-[var(--text-faint)] ml-auto">
                          {run.surface}
                        </span>
                      )}
                    </div>
                    <p className="t-11 text-[var(--text-soft)] line-clamp-2 leading-snug">
                      {run.input || "(message vide)"}
                    </p>
                    <p className="t-9 font-mono tracking-[0.08em] text-[var(--text-faint)] mt-1">
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
    </aside>
  );
}
