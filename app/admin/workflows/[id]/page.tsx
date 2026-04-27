import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

interface StepRow {
  id: string;
  step_order: number;
  action_type: string;
  config: Record<string, unknown>;
  agents: { id: string; name: string; model_provider: string; model_name: string } | null;
}

interface RunRow {
  id: string;
  status: string;
  created_at: string;
  finished_at: string | null;
}

interface Props {
  params: Promise<{ id: string }>;
}

const stepTypeColor: Record<string, string> = {
  chat: "border-[var(--cykan)]/50 text-[var(--cyan-accent)]",
  tool_call: "border-purple-700 text-purple-400",
  condition: "border-[var(--warn)]/50 text-[var(--warn)]",
  loop: "border-[var(--cykan)]/50 text-[var(--cykan)]",
  transform: "border-[var(--line-strong)] text-[var(--text-muted)]",
};

export default async function WorkflowDetailPage({ params }: Props) {
  const { id } = await params;
  const sb = getServerSupabase();
  if (!sb) notFound();

  const [wfRes, stepsRes, runsRes] = await Promise.all([
    sb.from("workflows").select("*").eq("id", id).single(),
    sb
      .from("workflow_steps")
      .select("id, step_order, action_type, config, agents(id, name, model_provider, model_name)")
      .eq("workflow_id", id)
      .order("step_order", { ascending: true }),
    sb
      .from("workflow_runs")
      .select("id, status, created_at, finished_at")
      .eq("workflow_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  if (wfRes.error || !wfRes.data) notFound();
  const workflow = wfRes.data;
  const steps = (stepsRes.data ?? []) as unknown as StepRow[];
  const runs = (runsRes.data ?? []) as unknown as RunRow[];

  const statusColor: Record<string, string> = {
    active: "text-[var(--money)]",
    draft: "text-[var(--text-muted)]",
    archived: "text-[var(--text-muted)]",
  };

  return (
    <div className="px-8 py-10">
      <div className="mb-6">
        <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Workflow</p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-[var(--text)]">{workflow.name}</h1>
          <span className={`text-xs font-medium ${statusColor[workflow.status] ?? "text-[var(--text-muted)]"}`}>
            {workflow.status}
          </span>
        </div>
        {workflow.description && (
          <p className="mt-1 text-sm text-[var(--text-muted)]">{workflow.description}</p>
        )}
        <div className="mt-2 flex items-center gap-3 text-xs text-[var(--text-muted)]">
          <span>Trigger: {workflow.trigger_type}</span>
          <span>{steps.length} étapes</span>
        </div>
      </div>

      {/* Steps pipeline */}
      <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Pipeline</h2>
      {steps.length === 0 ? (
        <div className="mb-8 rounded-lg border border-[var(--line-strong)] bg-[var(--bg-elev)] p-6 text-center">
          <p className="text-sm text-[var(--text-muted)]">Aucune étape. Utilisez l&apos;API pour ajouter des steps.</p>
          <pre className="mt-2 text-xs font-mono text-[var(--text-muted)]">POST /api/workflows/{id}/steps</pre>
        </div>
      ) : (
        <div className="mb-8 space-y-2">
          {steps.map((step, i) => (
            <div key={step.id} className="flex items-stretch gap-3">
              {/* Connector */}
              <div className="flex w-8 flex-col items-center">
                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--line-strong)] bg-[var(--bg-soft)] text-xs font-semibold text-[var(--text-muted)]">
                  {i + 1}
                </div>
                {i < steps.length - 1 && (
                  <div className="w-px flex-1 bg-[var(--bg-soft)]" />
                )}
              </div>

              {/* Step card */}
              <div className="flex-1 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full border px-2 py-0.5 t-10 font-medium ${stepTypeColor[step.action_type] ?? "border-[var(--line-strong)] text-[var(--text-muted)]"}`}>
                      {step.action_type}
                    </span>
                    {step.agents && (
                      <span className="text-xs text-[var(--text-muted)]">{step.agents.name}</span>
                    )}
                  </div>
                  {step.agents && (
                    <span className="t-10 font-mono text-[var(--text-muted)]">
                      {step.agents.model_provider}/{step.agents.model_name}
                    </span>
                  )}
                </div>
                {Object.keys(step.config || {}).length > 0 && (
                  <pre className="mt-2 max-h-20 overflow-auto t-11 font-mono text-[var(--text-muted)]">
                    {JSON.stringify(step.config, null, 2)}
                  </pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Recent runs */}
      <h2 className="mb-4 text-lg font-semibold text-[var(--text)]">Runs récents</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun run.</p>
      ) : (
        <div className="space-y-2">
          {runs.map((r) => (
            <Link
              key={r.id}
              href={`/admin/runs/${r.id}`}
              className="flex items-center justify-between rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-4 transition-colors hover:border-[var(--line-strong)]"
            >
              <div className="flex items-center gap-3">
                <span className={`h-2 w-2 rounded-full ${r.status === "completed" ? "bg-[var(--money)]" : r.status === "failed" ? "bg-[var(--danger)]" : r.status === "running" ? "bg-[var(--cykan)]" : "bg-[var(--text-muted)]"}`} />
                <span className="text-xs text-[var(--text-muted)]">{r.status}</span>
              </div>
              <span className="text-xs text-[var(--text-muted)]">
                {new Date(r.created_at).toLocaleString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
