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

interface HealthData {
  report_date: string;
  today: { status: string; report_id?: string; generated_at?: string };
  last_success: { report_date: string; report_id: string } | null;
  last_failure: { report_date: string; report_id: string; error: string | null } | null;
  streak_consecutive_success: number;
  recent_14d: { total: number; success: number; failed: number; success_rate: number | null };
}

const STATUS_CONFIG: Record<string, { label: string; dot: string; badge: string }> = {
  completed: {
    label: "Succès",
    dot: "bg-green-400",
    badge: "text-green-400 bg-green-950/40 border-green-900/50",
  },
  failed: {
    label: "Échoué",
    dot: "bg-red-400",
    badge: "text-red-400 bg-red-950/40 border-red-900/50",
  },
  running: {
    label: "En cours",
    dot: "bg-blue-400 animate-pulse",
    badge: "text-blue-400 bg-blue-950/40 border-blue-900/50",
  },
  pending: {
    label: "En attente",
    dot: "bg-yellow-400",
    badge: "text-yellow-400 bg-yellow-950/40 border-yellow-900/50",
  },
  skipped: {
    label: "Ignoré",
    dot: "bg-zinc-500",
    badge: "text-zinc-400 bg-zinc-900 border-zinc-800",
  },
  not_generated: {
    label: "Non généré",
    dot: "bg-zinc-600",
    badge: "text-zinc-500 bg-zinc-900 border-zinc-800",
  },
};

function StatusDot({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return <span className={`inline-block h-2 w-2 rounded-full ${cfg.dot}`} />;
}

function StatusBadge({ status }: { status: string }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.pending;
  return (
    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${cfg.badge}`}>
      {cfg.label}
    </span>
  );
}

const REPORT_TYPES = [
  { value: "all", label: "Tous" },
  { value: "crypto_daily", label: "Daily Crypto" },
  { value: "market_watch", label: "Market Watch" },
  { value: "market_alert", label: "Market Alert" },
] as const;

const TYPE_STYLE: Record<string, { label: string; color: string }> = {
  crypto_daily: { label: "Daily Crypto", color: "text-amber-400 bg-amber-950/30 border-amber-900/40" },
  market_watch: { label: "Market Watch", color: "text-indigo-400 bg-indigo-950/30 border-indigo-900/40" },
  market_alert: { label: "Market Alert", color: "text-rose-400 bg-rose-950/30 border-rose-900/40" },
};

const SEVERITY_STYLE: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "text-red-300 bg-red-950/50 border-red-800/50" },
  warning: { label: "Warning", color: "text-yellow-300 bg-yellow-950/40 border-yellow-800/40" },
  info: { label: "Info", color: "text-blue-300 bg-blue-950/40 border-blue-800/40" },
};

function extractSeverity(highlights: string[] | null): string | null {
  if (!highlights) return null;
  const sevLine = highlights.find((h) => h.startsWith("severity: "));
  return sevLine ? sevLine.replace("severity: ", "") : null;
}

function extractSignalTypes(highlights: string[] | null): string[] {
  if (!highlights) return [];
  const sigLine = highlights.find((h) => h.startsWith("signal_types: "));
  return sigLine ? sigLine.replace("signal_types: ", "").split(", ").filter(Boolean) : [];
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activeType, setActiveType] = useState<string>("all");

  const [healthAll, setHealthAll] = useState<Record<string, HealthData>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const typeParam = activeType !== "all" ? `&type=${activeType}` : "";
    const healthType = activeType !== "all" ? activeType : "crypto_daily";

    const fetches: Promise<Response>[] = [
      fetch(`/api/reports?limit=30${typeParam}`),
      fetch(`/api/reports/health?type=${healthType}`),
    ];

    if (activeType === "all") {
      fetches.push(fetch("/api/reports/health?type=market_watch"));
      fetches.push(fetch("/api/reports/health?type=market_alert"));
    }

    const results = await Promise.all(fetches);
    const reportsJson = await results[0].json();
    const healthJson = await results[1].json();

    setReports(reportsJson.reports ?? []);
    setHealth(healthJson);

    if (activeType === "all" && results.length >= 4) {
      const mwHealth = await results[2].json();
      const maHealth = await results[3].json();
      setHealthAll({ crypto_daily: healthJson, market_watch: mwHealth, market_alert: maHealth });
    } else {
      setHealthAll({});
    }

    setLoading(false);
  }, [activeType]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
            Opérations
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Reports
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            Surveillance et historique des capabilities de reporting.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-zinc-800 p-0.5">
            {REPORT_TYPES.map((t) => (
              <button
                key={t.value}
                onClick={() => setActiveType(t.value)}
                className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
                  activeType === t.value
                    ? "bg-zinc-800 text-white"
                    : "text-zinc-500 hover:text-zinc-300"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={load}
            className="rounded-lg border border-zinc-700 px-4 py-2 text-xs text-zinc-400 transition-colors hover:border-zinc-500 hover:text-white"
          >
            Rafraîchir
          </button>
        </div>
      </div>

      {/* ─── Multi-type overview ─── */}
      {activeType === "all" && Object.keys(healthAll).length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-4">
          {Object.entries(healthAll).map(([type, h]) => {
            const ts = TYPE_STYLE[type] ?? { label: type, color: "text-zinc-400 bg-zinc-900 border-zinc-800" };
            return (
              <div key={type} className={`rounded-xl border px-5 py-4 ${
                h.today.status === "completed" ? "border-green-900/30 bg-green-950/10"
                  : h.today.status === "failed" ? "border-red-900/30 bg-red-950/10"
                  : "border-zinc-800 bg-zinc-950/60"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <span className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${ts.color}`}>
                    {ts.label}
                  </span>
                  <StatusDot status={h.today.status} />
                  <span className="text-xs text-white">
                    {STATUS_CONFIG[h.today.status]?.label ?? h.today.status}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[10px] text-zinc-500">
                  <span>Streak: <strong className="text-zinc-300">{h.streak_consecutive_success}</strong></span>
                  <span>14j: <strong className="text-zinc-300">{h.recent_14d.success_rate ?? "—"}%</strong></span>
                  <span>{h.recent_14d.success}/{h.recent_14d.total} ok</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Health dashboard (single type) ─── */}
      {health && activeType !== "all" && (
        <div className="mb-8 grid grid-cols-4 gap-4">
          {/* Today */}
          <div className={`rounded-xl border px-4 py-4 ${
            health.today.status === "completed"
              ? "border-green-900/40 bg-green-950/10"
              : health.today.status === "failed"
                ? "border-red-900/40 bg-red-950/10"
                : "border-zinc-800 bg-zinc-950/60"
          }`}>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Aujourd'hui
            </p>
            <div className="mt-2 flex items-center gap-2">
              <StatusDot status={health.today.status} />
              <span className="text-sm font-medium text-white">
                {STATUS_CONFIG[health.today.status]?.label ?? health.today.status}
              </span>
            </div>
            {health.today.generated_at && (
              <p className="mt-1 text-[10px] text-zinc-600">
                {new Date(health.today.generated_at).toLocaleTimeString()}
              </p>
            )}
          </div>

          {/* Streak */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Streak succès
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {health.streak_consecutive_success}
              <span className="ml-1 text-sm font-normal text-zinc-500">jours</span>
            </p>
          </div>

          {/* Success rate */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Taux 14j
            </p>
            <p className="mt-2 text-2xl font-bold text-white">
              {health.recent_14d.success_rate !== null
                ? `${health.recent_14d.success_rate}%`
                : "—"}
            </p>
            <p className="mt-1 text-[10px] text-zinc-600">
              {health.recent_14d.success}/{health.recent_14d.total} réussis
            </p>
          </div>

          {/* Last failure */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
              Dernier échec
            </p>
            {health.last_failure ? (
              <>
                <p className="mt-2 text-sm font-medium text-red-400">
                  {health.last_failure.report_date}
                </p>
                <p className="mt-1 truncate text-[10px] text-zinc-500" title={health.last_failure.error ?? ""}>
                  {health.last_failure.error?.slice(0, 60) ?? "—"}
                </p>
              </>
            ) : (
              <p className="mt-2 text-sm text-green-400">Aucun</p>
            )}
          </div>
        </div>
      )}

      {/* ─── Report list ─── */}
      {loading ? (
        <p className="text-sm text-zinc-500">Chargement…</p>
      ) : reports.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun rapport trouvé.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {reports.map((r) => (
            <div key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80">
              <button
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="min-w-[90px] text-sm font-medium text-white">
                  {r.report_date}
                </span>
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold border ${
                  TYPE_STYLE[r.report_type]?.color ?? "text-zinc-400 bg-zinc-900 border-zinc-800"
                }`}>
                  {TYPE_STYLE[r.report_type]?.label ?? r.report_type}
                </span>
                <StatusBadge status={r.status} />
                {(() => {
                  const sev = extractSeverity(r.highlights);
                  if (!sev) return null;
                  const s = SEVERITY_STYLE[sev];
                  return s ? (
                    <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${s.color}`}>
                      {s.label}
                    </span>
                  ) : null;
                })()}
                <span className="rounded bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-500">
                  {r.triggered_by}
                </span>
                {r.idempotency_decision && !["run", "cooldown_passed"].includes(r.idempotency_decision) && (
                  <span className="rounded bg-yellow-950/30 px-2 py-0.5 text-[10px] text-yellow-500 border border-yellow-900/30">
                    {r.idempotency_decision}
                  </span>
                )}
                <span className="flex-1 truncate text-xs text-zinc-500">
                  {r.status === "failed"
                    ? r.error_message?.slice(0, 80) ?? "—"
                    : r.summary?.slice(0, 100) ?? "—"}
                </span>
                {r.run_id && (
                  <span className="font-mono text-[10px] text-zinc-700">
                    run:{r.run_id.slice(0, 8)}
                  </span>
                )}
                <span className="text-[10px] text-zinc-700">
                  {new Date(r.created_at).toLocaleTimeString()}
                </span>
                <svg
                  className={`h-4 w-4 text-zinc-600 transition-transform ${expanded === r.id ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expanded === r.id && (
                <div className="border-t border-zinc-800 px-4 py-4">
                  {/* Error - prominent */}
                  {r.error_message && (
                    <div className="mb-4 rounded-lg border border-red-900/30 bg-red-950/20 p-4">
                      <p className="text-[10px] font-semibold uppercase text-red-500 mb-1">
                        Erreur
                      </p>
                      <p className="text-sm text-red-300 font-mono break-all">
                        {r.error_message}
                      </p>
                    </div>
                  )}

                  {/* Metadata grid */}
                  <div className="mb-4 grid grid-cols-2 gap-x-6 gap-y-3 text-xs md:grid-cols-4">
                    <MetaField label="Report ID" value={r.id} mono />
                    <MetaField
                      label="Run ID"
                      value={r.run_id}
                      mono
                      link={r.run_id ? `/runs` : undefined}
                    />
                    <MetaField label="Workflow" value={r.workflow_id?.slice(0, 12)} mono />
                    <MetaField label="Décision" value={r.idempotency_decision ?? "run"} />
                    <MetaField label="Trigger" value={r.triggered_by} />
                    <MetaField label="Créé" value={new Date(r.created_at).toLocaleString()} />
                    <MetaField label="MAJ" value={new Date(r.updated_at).toLocaleString()} />
                    <MetaField label="Type" value={r.report_type} />
                    {extractSeverity(r.highlights) && (
                      <MetaField label="Sévérité" value={extractSeverity(r.highlights)} />
                    )}
                    {extractSignalTypes(r.highlights).length > 0 && (
                      <MetaField label="Signaux" value={extractSignalTypes(r.highlights).join(", ")} />
                    )}
                  </div>

                  {/* Highlights */}
                  {r.highlights && r.highlights.filter((h) => !h.startsWith("severity: ") && !h.startsWith("signal_types: ")).length > 0 && (
                    <div className="mb-4 rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
                      <p className="text-[10px] font-semibold uppercase text-zinc-500 mb-2">
                        Points clés
                      </p>
                      <ul className="space-y-1.5">
                        {r.highlights.filter((h) => !h.startsWith("severity: ") && !h.startsWith("signal_types: ")).map((h, i) => (
                          <li key={i} className="flex items-start gap-2 text-xs text-zinc-300">
                            <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                            {h}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Content */}
                  {r.content_markdown && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase text-zinc-500 mb-2">
                        Rapport complet
                      </p>
                      <div className="max-h-[500px] overflow-auto rounded-lg border border-zinc-800 bg-zinc-900 p-4">
                        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-zinc-300">
                          {r.content_markdown}
                        </pre>
                      </div>
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

function MetaField({
  label,
  value,
  mono,
  link,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
  link?: string;
}) {
  const display = value ?? "—";
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase text-zinc-600">{label}</p>
      {link ? (
        <a href={link} className={`text-blue-400 hover:underline ${mono ? "font-mono" : ""}`}>
          {display.length > 16 ? `${display.slice(0, 12)}…` : display}
        </a>
      ) : (
        <p className={`text-zinc-400 break-all ${mono ? "font-mono" : ""}`}>
          {display.length > 36 ? `${display.slice(0, 12)}…` : display}
        </p>
      )}
    </div>
  );
}
