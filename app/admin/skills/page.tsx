import Link from "next/link";
import EmptyState from "../_components/EmptyState";
import { getServerSupabase } from "@/lib/platform/db/supabase";

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
          <p className="t-9 font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">Hearst</p>
          <h1 className="t-28 font-semibold tracking-tight text-[var(--text)]">Skills</h1>
          <p className="mt-1 t-13 text-[var(--text-muted)]">Capacités assignables aux agents.</p>
        </div>
        <Link
          href="/admin/skills/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-4 py-2 t-13"
        >
          + Nouveau skill
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 t-13 text-[var(--danger)]">
          {error}
        </div>
      )}

      {skills.length === 0 && !error ? (
        <EmptyState
          iconKind="intent"
          title="Pas encore de skill"
          description="Les skills sont les capacités atomiques (résumé, draft, recherche…) qu'on peut assigner à un agent. Charge le set dev pour partir avec 5 skills réutilisables."
          createHref="/admin/skills/new"
          createLabel="+ Créer un skill"
          seedResource="skills"
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {skills.map((s) => (
            <Link
              key={s.id}
              href={`/admin/skills/${s.id}`}
              className="flex flex-col gap-2 rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5 transition-colors hover:border-[var(--line-strong)]"
            >
              <div className="flex items-start justify-between">
                <h3 className="t-13 font-semibold text-[var(--text)]">{s.name}</h3>
                <span className="rounded-pill border border-[var(--line-strong)] px-2 py-0.5 t-10 text-[var(--text-muted)]">
                  {s.category}
                </span>
              </div>
              {s.description && (
                <p className="line-clamp-2 t-9 text-[var(--text-muted)]">{s.description}</p>
              )}
              <span className="t-10 font-mono text-[var(--text-muted)]">v{s.active_version}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
