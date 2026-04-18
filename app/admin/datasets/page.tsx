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
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Hearst</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Datasets</h1>
          <p className="mt-1 text-sm text-zinc-500">Jeux de tests pour évaluation structurée.</p>
        </div>
        <Link
          href="/admin/datasets/new"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
        >
          + Nouveau dataset
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {datasets.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">Aucun dataset créé.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {datasets.map((d) => (
            <Link
              key={d.id}
              href={`/datasets/${d.id}`}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 transition-colors hover:border-zinc-700"
            >
              <h3 className="text-sm font-semibold text-white">{d.name}</h3>
              {d.description && (
                <p className="line-clamp-2 text-xs text-zinc-500">{d.description}</p>
              )}
              <div className="flex items-center gap-3 text-[10px] text-zinc-600">
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
