import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface SkillRow {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  active_version: number;
  created_at: string;
}

export default async function SkillsPage() {
  let skills: SkillRow[] = [];
  let error: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    error = "Supabase non configuré.";
  } else {
    try {
      const res = await sb
        .from("skills")
        .select("id, name, slug, category, description, active_version, created_at")
        .order("created_at", { ascending: false });
      if (res.error) throw new Error(res.error.message);
      skills = (res.data ?? []) as unknown as SkillRow[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur DB";
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-zinc-500">Hearst</p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">Skills</h1>
          <p className="mt-1 text-sm text-zinc-500">Capacités assignables aux agents.</p>
        </div>
        <Link
          href="/admin/skills/new"
          className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-zinc-200"
        >
          + Nouveau skill
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {skills.length === 0 && !error ? (
        <p className="text-sm text-zinc-500">Aucun skill créé.</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((s) => (
            <Link
              key={s.id}
              href={`/skills/${s.id}`}
              className="flex flex-col gap-2 rounded-xl border border-zinc-800 bg-zinc-950/80 p-5 transition-colors hover:border-zinc-700"
            >
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-semibold text-white">{s.name}</h3>
                <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-500">
                  {s.category}
                </span>
              </div>
              {s.description && (
                <p className="line-clamp-2 text-xs text-zinc-500">{s.description}</p>
              )}
              <span className="text-[10px] font-mono text-zinc-600">v{s.active_version}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
