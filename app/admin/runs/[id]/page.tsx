/**
 * Admin Run Detail Page
 */
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const traceKindColor: Record<string, string> = {
  llm_call: "border-blue-700 text-blue-400",
  tool_call: "border-purple-700 text-purple-400",
  memory_read: "border-cyan-700 text-cyan-400",
  memory_write: "border-teal-700 text-teal-400",
  skill_invoke: "border-amber-700 text-amber-400",
  error: "border-red-700 text-red-400",
  guard: "border-yellow-700 text-yellow-400",
  custom: "border-zinc-700 text-zinc-400",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function RunDetailPage({ params }: Props) {
  const { id } = await params;
  const sb = getServerSupabase();
  if (!sb) notFound();

  const [runRes, tracesRes] = await Promise.all([
    sb.from("runs").select("*, agents(name, slug)").eq("id", id).single(),
    sb
      .from("traces")
      .select("*")
      .eq("run_id", id)
      .order("step_index", { ascending: true })
      .order("started_at", { ascending: true }),
  ]);

  if (runRes.error || !runRes.data) notFound();
  const run = runRes.data;
  const traces = tracesRes.data ?? [];
  const agent = run.agents as { name: string; slug: string } | null;

  const statusColor: Record<string, string> = {
    completed: "text-emerald-400",
    running: "text-blue-400",
    failed: "text-red-400",
    pending: "text-zinc-500",
  };

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">
          Run
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-white">
            {run.kind}
          </h1>
          <span className={`text-sm font-medium ${statusColor[run.status] ?? "text-zinc-500"}`}>
            {run.status}
          </span>
        </div>
        {agent && (
          <p className="mt-1 text-sm text-zinc-500">Agent: {agent.name}</p>
        )}
      </div>

      {/* Run summary */}
      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-5">
        {[
          { label: "Tokens In", value: run.tokens_in },
          { label: "Tokens Out", value: run.tokens_out },
          { label: "Cost", value: `$${(run.cost_usd ?? 0).toFixed(4)}` },
          { label: "Latency", value: `${run.latency_ms ?? 0}ms` },
          { label: "Traces", value: traces.length },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <p className="text-[10px] font-medium uppercase text-zinc-600">{s.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-white">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Input / Output */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Input</h3>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-300">
            {JSON.stringify(run.input, null, 2)}
          </pre>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
          <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Output</h3>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono text-xs text-zinc-300">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      </div>

      {run.error && (
        <div className="mb-8 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {run.error}
        </div>
      )}

      {/* Traces timeline */}
      <h2 className="mb-4 text-lg font-semibold text-white">Traces</h2>
      {traces.length === 0 ? (
        <p className="text-sm text-zinc-500">Aucune trace.</p>
      ) : (
        <div className="space-y-2">
          {traces.map((t, i) => (
            <div
              key={t.id}
              className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-zinc-600">#{i + 1}</span>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${traceKindColor[t.kind] ?? "border-zinc-700 text-zinc-400"}`}
                  >
                    {t.kind}
                  </span>
                  <span className="text-sm text-zinc-300">{t.name}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-zinc-600">
                  {t.model_used && <span>{t.model_used}</span>}
                  {t.latency_ms != null && <span>{t.latency_ms}ms</span>}
                  {(t.tokens_in ?? 0) > 0 && (
                    <span>{(t.tokens_in ?? 0) + (t.tokens_out ?? 0)} tok</span>
                  )}
                </div>
              </div>

              {t.error && (
                <p className="mt-2 text-xs text-red-400">{t.error}</p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <p className="text-[10px] font-medium uppercase text-zinc-600">Input</p>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
                    {JSON.stringify(t.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="text-[10px] font-medium uppercase text-zinc-600">Output</p>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono text-[11px] text-zinc-400">
                    {JSON.stringify(t.output, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw run ID */}
      <p className="mt-8 font-mono text-[10px] text-zinc-700">
        run_id: {run.id}
      </p>
    </div>
  );
}
