import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/supabase-server";
import ModelBadge from "../../../components/ModelBadge";
import ChatWindow from "../../../components/ChatWindow";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ id: string }>;
}

interface RunRow {
  id: string;
  kind: string;
  status: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number | null;
  created_at: string;
}

export default async function AgentDetailPage({ params }: Props) {
  const { id } = await params;
  const sb = getServerSupabase();

  if (!sb) notFound();

  const { data: agent, error } = await sb
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (error || !agent) notFound();

  const [skillsRes, memoriesRes, evalsRes, runsRes, convosRes] = await Promise.all([
    sb.from("agent_skills").select("skills(id, name, category)").eq("agent_id", id),
    sb
      .from("agent_memory")
      .select("id, key, value, memory_type, importance")
      .eq("agent_id", id)
      .order("importance", { ascending: false })
      .limit(10),
    sb
      .from("evaluations")
      .select("id, eval_type, score, passed, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    sb
      .from("runs")
      .select("id, kind, status, tokens_in, tokens_out, cost_usd, latency_ms, created_at")
      .eq("agent_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    sb
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", id),
  ]);

  const skills = skillsRes.data ?? [];
  const memories = memoriesRes.data ?? [];
  const evals = evalsRes.data ?? [];
  const runs = (runsRes.data ?? []) as unknown as RunRow[];
  const totalConversations = convosRes.count ?? 0;

  const totalTokens = runs.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0);
  const totalCost = runs.reduce((s, r) => s + (r.cost_usd ?? 0), 0);
  const avgLatency = runs.filter((r) => r.latency_ms).length > 0
    ? Math.round(runs.filter((r) => r.latency_ms).reduce((s, r) => s + r.latency_ms!, 0) / runs.filter((r) => r.latency_ms).length)
    : 0;
  const successRate = runs.length > 0
    ? Math.round((runs.filter((r) => r.status === "completed").length / runs.length) * 100)
    : 0;

  const statusDot: Record<string, string> = {
    active: "bg-emerald-500",
    paused: "bg-amber-500",
    archived: "bg-zinc-600",
  };

  return (
    <div className="px-8 py-10">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${statusDot[agent.status] ?? "bg-zinc-600"}`} />
            <h1 className="text-2xl font-semibold text-white">{agent.name}</h1>
          </div>
          {agent.description && (
            <p className="mt-1 max-w-xl text-sm text-zinc-400">{agent.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <ModelBadge provider={agent.model_provider} model={agent.model_name} />
            <span className="text-[10px] font-mono text-zinc-600">v{agent.version}</span>
          </div>
        </div>
      </div>

      {/* Agent stats */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          { label: "Runs", value: runs.length },
          { label: "Conversations", value: totalConversations },
          { label: "Tokens", value: totalTokens > 1000 ? `${(totalTokens / 1000).toFixed(1)}k` : totalTokens },
          { label: "Coût", value: `$${totalCost.toFixed(4)}` },
          { label: "Succès", value: `${successRate}%`, sub: `avg ${avgLatency}ms` },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border border-zinc-800 bg-zinc-950/80 px-4 py-3">
            <p className="text-[10px] font-medium uppercase text-zinc-600">{s.label}</p>
            <p className="mt-0.5 text-lg font-semibold text-white">{s.value}</p>
            {s.sub && <p className="text-[10px] text-zinc-600">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left: Chat */}
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">Chat</h2>
          <ChatWindow agentId={id} />
        </div>

        {/* Right: Details */}
        <div className="space-y-5">
          {/* System prompt */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">System Prompt</h3>
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono text-xs leading-relaxed text-zinc-300">
              {agent.system_prompt || "—"}
            </pre>
          </div>

          {/* Config */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Config</h3>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <span className="text-zinc-600">Temperature</span>
                <p className="text-zinc-300">{agent.temperature}</p>
              </div>
              <div>
                <span className="text-zinc-600">Max tokens</span>
                <p className="text-zinc-300">{agent.max_tokens}</p>
              </div>
              <div>
                <span className="text-zinc-600">Top P</span>
                <p className="text-zinc-300">{agent.top_p}</p>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Skills</h3>
            {skills.length === 0 ? (
              <p className="text-xs text-zinc-600">Aucun skill attribué.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
                  const skill = s.skills as unknown as { id: string; name: string; category: string } | null;
                  return skill ? (
                    <span key={skill.id} className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[10px] font-medium text-zinc-400">
                      {skill.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Memory */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Memory</h3>
            {memories.length === 0 ? (
              <p className="text-xs text-zinc-600">Aucune mémoire.</p>
            ) : (
              <ul className="space-y-1 text-xs text-zinc-300">
                {memories.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="text-zinc-500">{m.key}:</span> {m.value}
                    </span>
                    <span className="shrink-0 text-zinc-600">{(m.importance * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent runs */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-zinc-500">Runs récents</h3>
              <Link href={`/admin/runs?agent_id=${id}`} className="text-[10px] text-zinc-600 hover:text-zinc-400">
                Tout voir →
              </Link>
            </div>
            {runs.length === 0 ? (
              <p className="text-xs text-zinc-600">Aucun run.</p>
            ) : (
              <div className="space-y-1">
                {runs.slice(0, 5).map((r) => (
                  <Link key={r.id} href={`/admin/runs/${r.id}`} className="flex items-center justify-between rounded-md px-2 py-1 text-xs transition-colors hover:bg-zinc-900">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-full ${r.status === "completed" ? "bg-emerald-500" : r.status === "failed" ? "bg-red-500" : "bg-zinc-600"}`} />
                      <span className="text-zinc-400">{r.kind}</span>
                    </div>
                    <span className="text-zinc-600">
                      {new Date(r.created_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Evaluations */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-950/80 p-5">
            <h3 className="mb-2 text-xs font-semibold uppercase text-zinc-500">Evaluations</h3>
            {evals.length === 0 ? (
              <p className="text-xs text-zinc-600">Aucune évaluation.</p>
            ) : (
              <ul className="space-y-1 text-xs text-zinc-300">
                {evals.map((ev) => (
                  <li key={ev.id} className="flex justify-between gap-2">
                    <span>
                      {ev.eval_type}{" "}
                      <span className={ev.passed ? "text-emerald-400" : "text-red-400"}>
                        {ev.passed ? "PASS" : "FAIL"}
                      </span>
                    </span>
                    <span className="text-zinc-600">{(ev.score * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
