import Link from "next/link";
import AgentCard from "../_components/AgentCard";
import EmptyState from "../_components/EmptyState";
import { getServerSupabase } from "@/lib/platform/db/supabase";

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
          <p className="t-9 font-medium uppercase tracking-[0.35em] text-[var(--text-muted)]">
            Hearst
          </p>
          <h1 className="t-28 font-semibold tracking-tight text-[var(--text)]">
            Agents
          </h1>
        </div>
        <Link
          href="/admin/agents/new"
          className="ghost-btn-solid ghost-btn-cykan rounded-sm px-4 py-2 t-13"
        >
          + Nouvel agent
        </Link>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-[var(--danger)]/40 bg-[var(--danger)]/10 px-4 py-3 t-13 text-[var(--danger)]">
          {error}
        </div>
      )}

      {agents.length === 0 && !error ? (
        <EmptyState
          iconKind="agent"
          title="Pas encore d'agent"
          description="Les agents définissent les comportements des assistants Hearst. Crée-en un manuellement, ou charge un set dev (4 agents typés : email, calendrier, research, slack)."
          createHref="/admin/agents/new"
          createLabel="+ Créer un agent"
          seedResource="agents"
        />
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
