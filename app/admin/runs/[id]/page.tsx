/**
 * Admin Run Detail Page
 */
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

const traceKindColor: Record<string, string> = {
  llm_call: "border-[var(--cykan)]/50 text-[var(--cyan-accent)]",
  tool_call: "border-purple-700 text-purple-400",
  memory_read: "border-[var(--cykan)]/50 text-[var(--cykan)]",
  memory_write: "border-teal-700 text-teal-400",
  skill_invoke: "border-[var(--warn)]/50 text-[var(--warn)]",
  error: "border-[var(--danger)]/70 text-[var(--danger)]",
  guard: "border-yellow-700 text-yellow-400",
  custom: "border-[var(--line-strong)] text-[var(--text-muted)]",
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
    completed: "text-[var(--money)]",
    running: "text-[var(--cyan-accent)]",
    failed: "text-[var(--danger)]",
    pending: "text-[var(--text-muted)]",
  };

  return (
    <div className="px-8 py-10">
      <div className="mb-8">
        <p className="t-9 font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">
          Run
        </p>
        <div className="flex items-center gap-3">
          <h1 className="t-24 font-semibold text-[var(--text)]">
            {run.kind}
          </h1>
          <span className={`t-13 font-medium ${statusColor[run.status] ?? "text-[var(--text-muted)]"}`}>
            {run.status}
          </span>
        </div>
        {agent && (
          <p className="mt-1 t-13 text-[var(--text-muted)]">Agent: {agent.name}</p>
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
          <div key={s.label} className="rounded-lg border border-[var(--line-strong)] bg-[var(--bg-elev)] px-4 py-3">
            <p className="t-10 font-medium uppercase text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-0.5 t-18 font-semibold text-[var(--text)]">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Input / Output */}
      <div className="mb-8 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
          <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">Input</h3>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono t-9 text-[var(--text-soft)]">
            {JSON.stringify(run.input, null, 2)}
          </pre>
        </div>
        <div className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
          <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">Output</h3>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap font-mono t-9 text-[var(--text-soft)]">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      </div>

      {run.error && (
        <div className="mb-8 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 t-13 text-[var(--danger)]">
          {run.error}
        </div>
      )}

      {/* Traces timeline */}
      <h2 className="mb-4 t-18 font-semibold text-[var(--text)]">Traces</h2>
      {traces.length === 0 ? (
        <p className="t-13 text-[var(--text-muted)]">Aucune trace.</p>
      ) : (
        <div className="space-y-2">
          {traces.map((t, i) => (
            <div
              key={t.id}
              className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-4"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="t-9 font-mono text-[var(--text-muted)]">#{i + 1}</span>
                  <span
                    className={`rounded-pill border px-2 py-0.5 t-10 font-medium ${traceKindColor[t.kind] ?? "border-[var(--line-strong)] text-[var(--text-muted)]"}`}
                  >
                    {t.kind}
                  </span>
                  <span className="t-13 text-[var(--text-soft)]">{t.name}</span>
                </div>
                <div className="flex items-center gap-4 t-9 text-[var(--text-muted)]">
                  {t.model_used && <span>{t.model_used}</span>}
                  {t.latency_ms != null && <span>{t.latency_ms}ms</span>}
                  {(t.tokens_in ?? 0) > 0 && (
                    <span>{(t.tokens_in ?? 0) + (t.tokens_out ?? 0)} tok</span>
                  )}
                </div>
              </div>

              {t.error && (
                <p className="mt-2 t-9 text-[var(--danger)]">{t.error}</p>
              )}

              <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div>
                  <p className="t-10 font-medium uppercase text-[var(--text-muted)]">Input</p>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono t-11 text-[var(--text-muted)]">
                    {JSON.stringify(t.input, null, 2)}
                  </pre>
                </div>
                <div>
                  <p className="t-10 font-medium uppercase text-[var(--text-muted)]">Output</p>
                  <pre className="mt-1 max-h-24 overflow-auto whitespace-pre-wrap font-mono t-11 text-[var(--text-muted)]">
                    {JSON.stringify(t.output, null, 2)}
                  </pre>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Raw run ID */}
      <p className="mt-8 font-mono t-10 text-[var(--text-faint)]">
        run_id: {run.id}
      </p>
    </div>
  );
}
