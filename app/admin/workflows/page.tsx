import Link from "next/link";
import EmptyState from "../_components/EmptyState";
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
    <div className="px-(--space-8) py-(--space-10)">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="t-9 font-medium uppercase tracking-(--tracking-brand) text-[var(--text-muted)]">Hearst</p>
          <h1 className="t-28 font-semibold tracking-(--tracking-tight) text-[var(--text)]">Workflows</h1>
          <p className="mt-1 t-13 text-[var(--text-muted)]">Orchestration multi-étapes.</p>
        </div>
        <Link
          href="/admin/workflows/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-(--radius-sm) px-4 py-2 t-13"
        >
          + Nouveau workflow
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-(--radius-lg) border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 t-13 text-[var(--danger)]">
          {error}
        </div>
      )}

      {workflows.length === 0 && !error ? (
        <EmptyState
          iconKind="router"
          title="Pas encore de workflow"
          description="Les workflows orchestrent plusieurs étapes (agents + tools) sur trigger manuel, schedule ou webhook. Charge le set dev (briefing du matin + recap hebdo) pour avoir un point de départ."
          createHref="/admin/workflows/new"
          createLabel="+ Créer un workflow"
          seedResource="workflows"
        />
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              href={`/admin/workflows/${wf.id}`}
              className="flex items-center justify-between rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5 transition-colors hover:border-[var(--line-strong)]"
            >
              <div>
                <h3 className="t-13 font-semibold text-[var(--text)]">{wf.name}</h3>
                {wf.description && (
                  <p className="mt-0.5 t-9 text-[var(--text-muted)]">{wf.description}</p>
                )}
              </div>
              <div className="flex items-center gap-4 t-9">
                <span className="text-[var(--text-muted)]">
                  {wf.workflow_steps?.length ?? 0} étapes
                </span>
                <span className="rounded-pill border border-[var(--line-strong)] px-2 py-0.5 text-[var(--text-muted)]">
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
