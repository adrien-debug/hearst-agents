"use client";

import { useEffect, useState } from "react";

interface Change {
  id: string;
  signal_id: string | null;
  change_type: string;
  target_id: string;
  target_type: string;
  before_value: unknown;
  after_value: unknown;
  actor: string;
  reason: string | null;
  created_at: string;
}

const CHANGE_TYPES = [
  "all", "guard_policy", "cost_budget", "model_switch",
  "tool_config", "agent_config", "prompt_update",
] as const;

export default function ChangesPage() {
  const [changes, setChanges] = useState<Change[]>([]);
  const [loading, setLoading] = useState(true);
  const [changeType, setChangeType] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams();
      if (changeType !== "all") params.set("change_type", changeType);
      params.set("limit", "100");
      setLoading(true);
      const res = await fetch(`/api/changes?${params}`);
      const json = await res.json();
      if (!cancelled) {
        setChanges(json.data ?? []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [changeType]);

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Décisions</p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">Historique des changements</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Audit trail de chaque décision appliquée au système.
        </p>
      </div>

      <div className="mb-6 flex items-center gap-1">
        <span className="mr-1 text-[10px] font-semibold uppercase text-zinc-600">Type</span>
        {CHANGE_TYPES.map((opt) => (
          <button
            key={opt}
            onClick={() => setChangeType(opt)}
            className={`rounded px-2 py-1 text-[11px] transition-colors ${
              changeType === opt
                ? "bg-zinc-800 text-white"
                : "text-zinc-500 hover:text-zinc-300"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-zinc-500">Chargement…</p>
      ) : changes.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucun changement enregistré.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {changes.map((c) => (
            <div key={c.id} className="rounded-xl border border-zinc-800 bg-zinc-950/80">
              <button
                onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <span className="rounded bg-zinc-800 px-2 py-0.5 text-[10px] font-semibold uppercase text-zinc-300">
                  {c.change_type}
                </span>
                <span className="text-xs text-zinc-500">{c.target_type}</span>
                <span className="text-xs text-zinc-600">{c.target_id.slice(0, 8)}…</span>
                <span className="flex-1 truncate text-sm text-zinc-400">
                  {c.reason ?? "—"}
                </span>
                <span className="text-xs text-zinc-600">{c.actor}</span>
                <span className="text-[10px] text-zinc-700">{new Date(c.created_at).toLocaleString()}</span>
              </button>

              {expanded === c.id && (
                <div className="border-t border-zinc-800 px-4 py-4">
                  {c.signal_id && (
                    <p className="mb-2 text-xs text-zinc-500">
                      Signal source : <span className="font-mono text-zinc-400">{c.signal_id.slice(0, 12)}…</span>
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase text-red-500">Avant</p>
                      <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-900 p-2 text-xs text-zinc-400">
                        {JSON.stringify(c.before_value, null, 2)}
                      </pre>
                    </div>
                    <div>
                      <p className="mb-1 text-[10px] font-semibold uppercase text-green-500">Après</p>
                      <pre className="max-h-40 overflow-auto rounded-lg bg-zinc-900 p-2 text-xs text-zinc-400">
                        {JSON.stringify(c.after_value, null, 2)}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
