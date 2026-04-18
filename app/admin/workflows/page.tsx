import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase-server";

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
  active: "text-emerald-400",
  draft: "text-zinc-500",
  archived: "text-zinc-600",
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
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Hearst</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-500">Orchestration multi-étapes.</p>
        </div>
        <Link
          href="/admin/workflows/new"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
        >
          + Nouveau workflow
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {workflows.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">Aucun workflow créé.</p>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <Link
              key={wf.id}
              href={`/workflows/${wf.id}`}
              className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 transition-colors hover:border-zinc-700"
            >
              <div>
                <h3 className="text-sm font-semibold text-white">{wf.name}</h3>
                {wf.description && (
                  <p className="mt-0.5 text-xs text-zinc-500">{wf.description}</p>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="text-zinc-600">
                  {wf.workflow_steps?.length ?? 0} étapes
                </span>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-zinc-500">
                  {wf.trigger_type}
                </span>
                <span className={statusColor[wf.status] ?? "text-zinc-600"}>
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
