import Link from "next/link";
import AgentCard from "../../components/AgentCard";
import { getServerSupabase } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  model_provider: string;
  model_name: string;
  status: string;
}

export default async function AgentsPage() {
  let agents: AgentRow[] = [];
  let error: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    error = "Supabase non configuré. Renseignez .env.local";
  } else {
    try {
      const res = await sb
        .from("agents")
        .select("id, name, slug, description, model_provider, model_name, status")
        .order("created_at", { ascending: false });
      if (res.error) throw new Error(res.error.message);
      agents = (res.data ?? []) as AgentRow[];
    } catch (e) {
      error = e instanceof Error ? e.message : "Erreur DB";
      console.error("AgentsPage:", error);
    }
  }

  return (
    <div className="px-8 py-10">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">
            Hearst
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">
            Agents
          </h1>
        </div>
        <Link
          href="/admin/agents/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-4 py-2 text-sm"
        >
          + Nouvel agent
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 text-sm text-[var(--danger)]">
          {error}
        </div>
      )}

      {agents.length === 0 && !error ? (
        <p className="text-sm text-[var(--text-muted)]">Aucun agent créé pour l&apos;instant.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}
    </div>
  );
}
