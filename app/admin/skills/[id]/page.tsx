import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function SkillDetailPage({ params }: Props) {
  const { id } = await params;
  const sb = getServerSupabase();
  if (!sb) notFound();

  const { data: skill, error } = await sb
    .from("skills")
    .select("id, name, slug, category, description, prompt_template, active_version, created_at")
    .eq("id", id)
    .single();

  if (error || !skill) notFound();

  const row = skill as {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string | null;
    prompt_template: string;
    active_version: number;
    created_at: string;
  };

  return (
    <div className="px-(--space-8) py-(--space-10)">
      <div className="mb-(--space-6)">
        <Link
          href="/admin/skills"
          className="t-10 font-medium text-[var(--text-muted)] hover:text-[var(--text)]"
        >
          ← Skills
        </Link>
      </div>

      <div className="mb-(--space-4) flex flex-wrap items-center gap-(--space-3)">
        <h1 className="t-24 font-semibold text-[var(--text)]">{row.name}</h1>
        <span className="rounded-(--radius-pill) border border-[var(--line-strong)] px-(--space-2) py-(--space-1) t-10 text-[var(--text-muted)]">
          {row.category}
        </span>
        <span className="t-10 font-mono text-[var(--text-muted)]">v{row.active_version}</span>
      </div>

      <p className="mb-(--space-2) t-10 font-mono text-[var(--text-faint)]">{row.slug}</p>

      {row.description && (
        <p className="mb-(--space-6) t-13 text-[var(--text-muted)] max-w-[min(100%,var(--width-center-max))]">
          {row.description}
        </p>
      )}

      <div className="mb-(--space-6) t-10 text-[var(--text-muted)]">
        <span>Créé : {new Date(row.created_at).toLocaleString("fr-FR")}</span>
      </div>

      <div
        className="rounded-(--radius-md) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-(--space-4)"
        style={{ maxHeight: "var(--height-admin-prompt-max)" }}
      >
        <h2 className="mb-(--space-3) t-10 font-semibold uppercase tracking-(--tracking-wide) text-[var(--text-muted)]">
          Prompt template
        </h2>
        <pre className="whitespace-pre-wrap font-mono t-11 text-[var(--text-soft)] overflow-auto max-h-full">
          {row.prompt_template || "—"}
        </pre>
      </div>
    </div>
  );
}
