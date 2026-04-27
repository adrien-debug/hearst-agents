import Link from "next/link";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

interface WorkflowRow {
  id: string;
  name: string;
  description: string | null;
  trigger_type: string;
  status: string;
  created_at: string;
  workflow_steps: { id: string; step_order: number; action_type: string }[];
}

const statusColor: Record<string, string> = {
  active: "text-[var(--money)]",
  draft: "text-[var(--text-muted)]",
  archived: "text-[var(--text-muted)]",
};

export default async function WorkflowsPage() {
  let workflows: WorkflowRow[] = [];
  let error: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    error = "Supabase non configuré.";
  } else {
    try {
      const res = await sb
        .from("workflows")
        .select("*, workflow_steps(id, step_order, action_type)")
        .order("created_at", { ascending: false });
      if (res.error) throw new Error(res.error.message);
      workflows = (res.data ?? []) as WorkflowRow[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur DB";
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Hearst</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Workflows</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Orchestration multi-étapes.</p>
        </div>
        <Link
          href="/admin/workflows/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-4 py-2 text-sm"
        >
          + Nouveau workflow
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {workflows.length === 0 && !error ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun workflow créé.</p>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              href={`/workflows/${wf.id}`}
              className="flex items-center justify-between rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5 transition-colors hover:border-[var(--line-strong)]"
            >
              <div>
                <h3 className="text-sm font-semibold text-[var(--text)]">{wf.name}</h3>
                {wf.description && (
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{wf.description}</p>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-[var(--text-muted)]">
                  {wf.workflow_steps?.length ?? 0} étapes
                </span>
                <span className="rounded-full border border-[var(--line-strong)] px-2 py-0.5 text-[var(--text-muted)]">
                  {wf.trigger_type}
                </span>
                <span className={statusColor[wf.status] ?? "text-[var(--text-muted)]"}>
                  {wf.status}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
