import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface RunRow {
  id: string;
  kind: string;
  status: string;
  agent_id: string | null;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number | null;
  created_at: string;
  error: string | null;
  agents: { name: string } | null;
}

const statusColor: Record<string, string> = {
  completed: "text-emerald-400",
  running: "text-blue-400",
  failed: "text-red-400",
  pending: "text-zinc-500",
  cancelled: "text-zinc-600",
  timeout: "text-amber-400",
};

const kindLabel: Record<string, string> = {
  chat: "Chat",
  workflow: "Workflow",
  evaluation: "Eval",
  tool_test: "Tool",
};

export default async function RunsPage() {
  let runs: RunRow[] = [];
  let error: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    error = "Supabase non configuré.";
  } else {
    try {
      const res = await sb
        .from("runs")
        .select("id, kind, status, agent_id, tokens_in, tokens_out, cost_usd, latency_ms, created_at, error, agents(name)")
        .order("created_at", { ascending: false })
        .limit(50);
      if (res.error) throw new Error(res.error.message);
      runs = (res.data ?? []) as unknown as RunRow[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur DB";
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
          Hearst
        </p>
        <h1 className="text-3xl font-semibold tracking-tight text-white">
          Runs
        </h1>
        <p className="mt-1 text-sm text-zinc-500">
          Chaque exécution, chaque trace, chaque token.
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {runs.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">Aucun run enregistré. Lancez un chat ou un workflow.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((run) => (
            <Link
              key={run.id}
              href={`/runs/${run.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-4 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-center gap-4">
                <span className="rounded-md border border-zinc-800 px-2 py-0.5 text-[10px] font-medium text-zinc-400">
                  {kindLabel[run.kind] ?? run.kind}
                </span>
                <span className={`text-xs font-medium ${statusColor[run.status] ?? "text-zinc-500"}`}>
                  {run.status}
                </span>
                {run.agents && (
                  <span className="text-xs text-zinc-500">{run.agents.name}</span>
                )}
                {run.error && (
                  <span className="max-w-[200px] truncate text-xs text-red-400/70">
                    {run.error}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-6 text-xs text-zinc-600">
                {run.tokens_in > 0 && (
                  <span>{run.tokens_in + run.tokens_out} tok</span>
                )}
                {run.latency_ms != null && run.latency_ms > 0 && (
                  <span>{run.latency_ms}ms</span>
                )}
                <span className="w-32 text-right">
                  {new Date(run.created_at).toLocaleString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
