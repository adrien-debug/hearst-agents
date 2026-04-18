"use client";

import { useEffect, useState, useCallback } from "react";

interface Report {
  id: string;
  report_date: string;
  report_type: string;
  status: string;
  summary: string | null;
  content_markdown: string | null;
  highlights: string[] | null;
  triggered_by: string;
  run_id: string | null;
  workflow_id: string | null;
  error_message: string | null;
  idempotency_decision: string | null;
  created_at: string;
  updated_at: string;
}

const statusStyle: Record<string, string> = {
  completed: "text-green-400 bg-green-950/40 border-green-900/50",
  failed: "text-red-400 bg-red-950/40 border-red-900/50",
  running: "text-blue-400 bg-blue-950/40 border-blue-900/50",
  pending: "text-yellow-400 bg-yellow-950/40 border-yellow-900/50",
  skipped: "text-zinc-400 bg-zinc-900 border-zinc-800",
};

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [todayStatus, setTodayStatus] = useState<{
    exists: boolean;
    status?: string;
    report_date: string;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [reportsRes, todayRes] = await Promise.all([
      fetch("/api/reports?limit=30"),
      fetch("/api/reports/today"),
    ]);
    const reportsJson = await reportsRes.json();
    const todayJson = await todayRes.json();

    setReports(reportsJson.reports ?? []);
    setTodayStatus(todayJson);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
          Opérations
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Daily Reports
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Historique et statut des rapports quotidiens.
        </p>
      </div>

      {/* Today banner */}
      {todayStatus && (
        <div
          className={`mb-6 rounded-xl border px-5 py-4 ${
            !todayStatus.exists
              ? "border-zinc-800 bg-zinc-950/60"
              : todayStatus.status === "completed"
                ? "border-green-900/50 bg-green-950/20"
                : "border-red-900/50 bg-red-950/20"
          }`}
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">
              {!todayStatus.exists ? "⏳" : todayStatus.status === "completed" ? "✅" : "❌"}
            </span>
            <div>
              <p className="text-sm font-medium text-white">
                Rapport du {todayStatus.report_date}
              </p>
              <p className="text-xs text-zinc-400">
                {!todayStatus.exists
                  ? "Pas encore généré"
                  : todayStatus.status === "completed"
                    ? "Généré avec succès"
                    : `Statut : ${todayStatus.status}`}
              </p>
            </div>
            <button
              onClick={load}
              className="ml-auto rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
            >
              Rafraîchir
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-zinc-500">Chargement…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun rapport trouvé.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div
              key={r.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/80"
            >
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-medium text-white">
                  {r.report_date}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${
                    statusStyle[r.status] ?? statusStyle.pending
                  }`}
                >
                  {r.status}
                </span>
                <span className="text-xs text-zinc-600">{r.triggered_by}</span>
                {r.idempotency_decision && r.idempotency_decision !== "run" && (
                  <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-500">
                    {r.idempotency_decision}
                  </span>
                )}
                <span className="flex-1 truncate text-xs text-zinc-500">
                  {r.summary?.slice(0, 100) ?? "—"}
                </span>
                <span className="text-[10px] text-zinc-700">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
              </button>

              {expanded === r.id && (
                <div className="border-t border-zinc-800 px-4 py-4">
                  {/* Metadata */}
                  <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-2 text-xs">
                    <div>
                      <span className="text-zinc-600">Report ID</span>
                      <p className="font-mono text-zinc-400">{r.id}</p>
                    </div>
                    <div>
                      <span className="text-zinc-600">Run ID</span>
                      <p className="font-mono text-zinc-400">
                        {r.run_id ? (
                          <a
                            href={`/api/runs/${r.run_id}`}
                            className="text-blue-400 hover:underline"
                            target="_blank"
                          >
                            {r.run_id.slice(0, 12)}…
                          </a>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-600">Workflow</span>
                      <p className="font-mono text-zinc-400">
                        {r.workflow_id?.slice(0, 12) ?? "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-zinc-600">Dernière MAJ</span>
                      <p className="text-zinc-400">
                        {new Date(r.updated_at).toLocaleString()}
                      </p>
                    </div>
                  </div>

                  {/* Error */}
                  {r.error_message && (
                    <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 p-3">
                      <p className="text-[10px] font-semibold uppercase text-red-500">
                        Erreur
                      </p>
                      <p className="text-sm text-red-300">{r.error_message}</p>
                    </div>
                  )}

                  {/* Highlights */}
                  {r.highlights && r.highlights.length > 0 && (
                    <div className="mb-4">
                      <p className="text-[10px] font-semibold uppercase text-zinc-600">
                        Points clés
                      </p>
                      <ul className="mt-1 space-y-1">
                        {r.highlights.map((h, i) => (
                          <li
                            key={i}
                            className="text-xs text-zinc-300"
                          >
                            • {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Content */}
                  {r.content_markdown && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-zinc-600">
                        Rapport complet
                      </p>
                      <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-zinc-900 p-4 text-xs leading-relaxed text-zinc-300">
                        {r.content_markdown}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
