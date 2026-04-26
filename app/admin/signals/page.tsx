"use client";

import { useEffect, useState, useCallback } from "react";

interface Signal {
  id: string;
  kind: string;
  priority: string;
  status: string;
  target_id: string;
  target_type: string;
  title: string;
  description: string;
  suggestion: string;
  data: Record<string, unknown>;
  created_at: string;
  applied_at: string | null;
  applied_by: string | null;
  resolution: string | null;
}

const PRIORITIES = ["all", "critical", "high", "medium", "low"] as const;
const STATUSES = ["all", "open", "acknowledged", "applied", "dismissed"] as const;
const KINDS = [
  "all", "agent_config", "prompt_tuning", "guard_policy",
  "tool_replacement", "cost_optimization", "reliability_alert",
] as const;

const priorityColor: Record<string, string> = {
  critical: "text-[var(--danger)] bg-[var(--danger)]/12 border-[var(--danger)]/40",
  high: "text-orange-400 bg-orange-950/40 border-orange-900/50",
  medium: "text-yellow-400 bg-yellow-950/40 border-yellow-900/50",
  low: "text-[var(--text-muted)] bg-[var(--bg-soft)] border-[var(--line-strong)]",
};

const statusColor: Record<string, string> = {
  open: "text-[var(--cyan-accent)]",
  acknowledged: "text-yellow-400",
  applied: "text-green-400",
  dismissed: "text-[var(--text-muted)]",
};

export default function SignalsPage() {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [priority, setPriority] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [kind, setKind] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (priority !== "all") params.set("priority", priority);
    if (status !== "all") params.set("status", status);
    if (kind !== "all") params.set("kind", kind);
    params.set("limit", "100");

    const res = await fetch(`/api/signals?${params}`);
    const json = await res.json();
    setSignals(json.data ?? []);
    setLoading(false);
  }, [priority, status, kind]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (priority !== "all") params.set("priority", priority);
      if (status !== "all") params.set("status", status);
      if (kind !== "all") params.set("kind", kind);
      params.set("limit", "100");
      setLoading(true);
      const res = await fetch(`/api/signals?${params}`);
      const json = await res.json();
      if (!cancelled) {
        setSignals(json.data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [priority, status, kind]);

  async function handleAction(signalId: string, action: "acknowledge" | "apply" | "dismiss") {
    setActing(signalId);
    await fetch(`/api/signals/${signalId}/resolve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        applied_by: "operator",
        resolution_note: `${action} via console`,
      }),
    });
    setActing(null);
    load();
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Décisions</p>
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Signaux</h1>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Recommandations et alertes générées par le système.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <FilterGroup label="Priorité" options={PRIORITIES} value={priority} onChange={setPriority} />
        <FilterGroup label="Status" options={STATUSES} value={status} onChange={setStatus} />
        <FilterGroup label="Type" options={KINDS} value={kind} onChange={setKind} />
        <button
          onClick={load}
          className="ml-auto rounded-lg border border-[var(--line-strong)] px-3 py-1.5 text-xs text-[var(--text-muted)] transition-colors hover:border-[var(--cykan)] hover:text-[var(--text)]"
        >
          Rafraîchir
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-[var(--text-muted)]">Chargement…</p>
      ) : signals.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun signal trouvé.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {signals.map((s) => (
            <div key={s.id} className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)]">
              <button
                onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className={`rounded px-2 py-0.5 text-[10px] font-semibold uppercase border ${priorityColor[s.priority] ?? priorityColor.low}`}>
                  {s.priority}
                </span>
                <span className={`text-xs font-medium ${statusColor[s.status] ?? "text-[var(--text-muted)]"}`}>
                  {s.status}
                </span>
                <span className="text-xs text-[var(--text-muted)]">{s.kind}</span>
                <span className="flex-1 truncate text-sm text-[var(--text)]">{s.title}</span>
                <span className="text-[10px] text-[var(--text-muted)]">{s.target_type}:{s.target_id.slice(0, 8)}</span>
                <span className="text-[10px] text-[var(--text-faint)]">{new Date(s.created_at).toLocaleDateString()}</span>
              </button>

              {expanded === s.id && (
                <div className="border-t border-[var(--line-strong)] px-4 py-4">
                  {s.description && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Description</p>
                      <p className="text-sm text-[var(--text-soft)]">{s.description}</p>
                    </div>
                  )}
                  {s.suggestion && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Suggestion</p>
                      <p className="text-sm text-[var(--money)]">{s.suggestion}</p>
                    </div>
                  )}
                  {s.data && Object.keys(s.data).length > 0 && (
                    <div className="mb-3">
                      <p className="text-[10px] font-semibold uppercase text-[var(--text-muted)]">Data</p>
                      <pre className="mt-1 max-h-40 overflow-auto rounded-lg bg-[var(--bg-soft)] p-2 text-xs text-[var(--text-muted)]">
                        {JSON.stringify(s.data, null, 2)}
                      </pre>
                    </div>
                  )}
                  {s.applied_at && (
                    <div className="mb-3 text-xs text-[var(--text-muted)]">
                      Résolu le {new Date(s.applied_at).toLocaleString()} par {s.applied_by ?? "—"}
                      {s.resolution && <span className="ml-2 text-[var(--text-muted)]">({s.resolution})</span>}
                    </div>
                  )}

                  {s.status === "open" && (
                    <div className="flex gap-2 pt-2">
                      <ActionBtn label="Acknowledge" loading={acting === s.id} onClick={() => handleAction(s.id, "acknowledge")} color="yellow" />
                      <ActionBtn label="Apply" loading={acting === s.id} onClick={() => handleAction(s.id, "apply")} color="green" />
                      <ActionBtn label="Dismiss" loading={acting === s.id} onClick={() => handleAction(s.id, "dismiss")} color="zinc" />
                    </div>
                  )}
                  {s.status === "acknowledged" && (
                    <div className="flex gap-2 pt-2">
                      <ActionBtn label="Apply" loading={acting === s.id} onClick={() => handleAction(s.id, "apply")} color="green" />
                      <ActionBtn label="Dismiss" loading={acting === s.id} onClick={() => handleAction(s.id, "dismiss")} color="zinc" />
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

function FilterGroup({
  label, options, value, onChange,
}: {
  label: string;
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span className="mr-1 text-[10px] font-semibold uppercase text-[var(--text-muted)]">{label}</span>
      {options.map((opt) => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={`rounded px-2 py-1 text-[11px] transition-colors ${
            value === opt
              ? "bg-[var(--bg-soft)] text-[var(--text)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-soft)]"
          }`}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function ActionBtn({
  label, loading, onClick, color,
}: {
  label: string;
  loading: boolean;
  onClick: () => void;
  color: "green" | "yellow" | "zinc";
}) {
  const colors = {
    green: "border-green-800 text-green-400 hover:bg-green-950/50",
    yellow: "border-yellow-800 text-yellow-400 hover:bg-yellow-950/50",
    zinc: "border-[var(--line-strong)] text-[var(--text-muted)] hover:bg-[var(--bg-soft)]",
  };
  return (
    <button
      disabled={loading}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-50 ${colors[color]}`}
    >
      {loading ? "…" : label}
    </button>
  );
}
