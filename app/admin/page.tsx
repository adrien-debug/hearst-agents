import StatsCard from "../components/StatsCard";
import AgentCard from "../components/AgentCard";
import Link from "next/link";
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

interface RunStat {
  status: string;
  kind: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number | null;
  created_at: string;
}

export default async function DashboardPage() {
  let agents: AgentRow[] = [];
  let totalConversations = 0;
  let totalWorkflows = 0;
  let totalRuns = 0;
  let recentRuns: RunStat[] = [];
  let totalTokens = 0;
  let totalCost = 0;
  let avgLatency = 0;
  let dbError: string | null = null;

  const sb = getServerSupabase();
  if (!sb) {
    dbError = "Supabase non configuré. Renseignez NEXT_PUBLIC_SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY dans .env.local";
  } else {
    try {
      const [agentsRes, convosRes, wfRes, runsCountRes, recentRunsRes] = await Promise.all([
        sb
          .from("agents")
          .select("id, name, slug, description, model_provider, model_name, status")
          .order("created_at", { ascending: false })
          .limit(6),
        sb.from("conversations").select("id", { count: "exact", head: true }),
        sb.from("workflows").select("id", { count: "exact", head: true }),
        sb.from("runs").select("id", { count: "exact", head: true }),
        sb
          .from("runs")
          .select("status, kind, tokens_in, tokens_out, cost_usd, latency_ms, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

      if (agentsRes.error) throw new Error(agentsRes.error.message);
      agents = (agentsRes.data ?? []) as AgentRow[];
      totalConversations = convosRes.count ?? 0;
      totalWorkflows = wfRes.count ?? 0;
      totalRuns = runsCountRes.count ?? 0;
      recentRuns = (recentRunsRes.data ?? []) as unknown as RunStat[];

      totalTokens = recentRuns.reduce((sum, r) => sum + r.tokens_in + r.tokens_out, 0);
      totalCost = recentRuns.reduce((sum, r) => sum + (r.cost_usd ?? 0), 0);
      const latencies = recentRuns
        .filter((r) => r.latency_ms != null && r.latency_ms > 0)
        .map((r) => r.latency_ms!);
      avgLatency = latencies.length > 0
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;
    } catch (e) {
      dbError = e instanceof Error ? e.message : "Erreur DB inconnue";
      console.error("Dashboard DB error:", dbError);
    }
  }

  const successRate = recentRuns.length > 0
    ? Math.round((recentRuns.filter((r) => r.status === "completed").length / recentRuns.length) * 100)
    : 0;

  return (
    <div className="px-8 py-10 bg-gradient-to-br from-[var(--mat-050)] via-[var(--bg-soft)] to-[var(--surface)] min-h-screen">
      <div className="mb-8 border-b border-white/[0.06] pb-8 bg-gradient-to-r from-white/[0.03] to-transparent p-6 rounded-lg">
        <p className="t-10 font-mono uppercase tracking-[0.15em] text-white/30">Hearst</p>
        <h1 className="mt-2 t-28 font-bold tracking-tight text-white">Command Center</h1>
        <p className="mt-2 t-13 font-normal leading-relaxed text-white/50">
          Vue d&apos;ensemble de la plateforme d&apos;orchestration.
        </p>
      </div>

      {dbError && (
        <div className="mb-6 border border-[var(--danger)]/30 bg-gradient-to-r from-[var(--danger)]/10 to-transparent px-4 py-3 rounded-lg text-sm text-[var(--danger)] font-mono">
          {dbError}
        </div>
      )}

      {/* Primary stats */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
        <StatsCard label="Agents" value={agents.length} sub="actifs" />
        <StatsCard label="Runs" value={totalRuns} />
        <StatsCard label="Conversations" value={totalConversations} />
        <StatsCard label="Workflows" value={totalWorkflows} />
        <StatsCard label="Tokens" value={totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens} sub="total" />
        <StatsCard label="Coût" value={`$${totalCost.toFixed(2)}`} sub="estimé" />
        <StatsCard label="Succès" value={`${successRate}%`} sub={`avg ${avgLatency}ms`} />
      </div>

      {/* Recent agents */}
      <div className="mb-6 flex items-center justify-between bg-gradient-to-r from-white/[0.02] to-transparent p-4 rounded-lg border border-white/[0.05]">
        <h2 className="t-11 font-mono uppercase tracking-[0.2em] text-white/40">Agents</h2>
        <Link href="/admin/agents" className="t-10 font-mono tracking-[0.1em] text-white/30 border-b border-white/10 pb-0.5 hover:text-[var(--cykan)] hover:border-[var(--cykan)] transition-colors">
          View all
        </Link>
      </div>
      {agents.length === 0 ? (
        <p className="text-sm text-[var(--text-muted)]">
          Aucun agent. Créez-en un depuis la page Agents.
        </p>
      ) : (
        <div className="mb-10 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {agents.map((a) => (
            <AgentCard key={a.id} agent={a} />
          ))}
        </div>
      )}

      {/* Quick actions */}
      <h2 className="mb-4 t-11 font-mono uppercase tracking-[0.25em] text-[var(--text-muted)]">Actions rapides</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { href: "/admin/agents/new", label: "Créer un agent" },
          { href: "/admin/runs", label: "Voir les runs" },
          { href: "/admin/workflows", label: "Workflows" },
          { href: "/admin/agents", label: "Tous les agents" },
          { href: "/admin/scheduler", label: "Scheduler" },
        ].map((action) => (
          <Link
            key={action.href}
            href={action.href}
            className="rounded-sm border border-[var(--line-strong)] bg-[var(--bg-elev)] px-4 py-3 text-center text-sm text-[var(--text-muted)] transition-colors hover:border-[var(--cykan)]/40 hover:text-[var(--text)]"
          >
            {action.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
