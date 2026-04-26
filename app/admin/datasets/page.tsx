import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface DatasetRow {
  id: string;
  name: string;
  description: string | null;
  agent_id: string | null;
  created_at: string;
  agents: { name: string } | null;
}

export default async function DatasetsPage() {
  let datasets: DatasetRow[] = [];
  let error: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    error = "Supabase non configuré.";
  } else {
    try {
      const res = await sb
        .from("datasets")
        .select("id, name, description, agent_id, created_at, agents(name)")
        .order("created_at", { ascending: false });
      if (res.error) throw new Error(res.error.message);
      datasets = (res.data ?? []) as unknown as DatasetRow[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur DB";
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Hearst</p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Datasets</h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">Jeux de tests pour évaluation structurée.</p>
        </div>
        <Link
          href="/admin/datasets/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-4 py-2 text-sm"
        >
          + Nouveau dataset
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {datasets.length === 0 && !error ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun dataset créé.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {datasets.map((d) => (
            <Link
              key={d.id}
              href={`/datasets/${d.id}`}
              className="flex flex-col gap-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5 transition-colors hover:border-[var(--line-strong)]"
            >
              <h3 className="text-sm font-semibold text-[var(--text)]">{d.name}</h3>
              {d.description && (
                <p className="line-clamp-2 text-xs text-[var(--text-muted)]">{d.description}</p>
              )}
              <div className="flex items-center gap-3 t-10 text-[var(--text-muted)]">
                {d.agents && <span>Agent: {d.agents.name}</span>}
                <span>
                  {new Date(d.created_at).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
