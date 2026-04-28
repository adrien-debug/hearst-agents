import { notFound } from "next/navigation";
import Link from "next/link";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import ModelBadge from "../../_components/ModelBadge";
import ChatWindow from "../../_components/ChatWindow";

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
    active: "bg-[var(--money)]",
    paused: "bg-[var(--warn)]",
    archived: "bg-[var(--text-muted)]",
  };

  return (
    <div className="px-(--space-8) py-(--space-10)">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-pill ${statusDot[agent.status] ?? "bg-[var(--text-muted)]"}`} />
            <h1 className="t-24 font-semibold text-[var(--text)]">{agent.name}</h1>
          </div>
          {agent.description && (
            <p className="mt-1 max-w-xl t-13 text-[var(--text-muted)]">{agent.description}</p>
          )}
          <div className="mt-2 flex items-center gap-3">
            <ModelBadge provider={agent.model_provider} model={agent.model_name} />
            <span className="t-10 font-mono text-[var(--text-muted)]">v{agent.version}</span>
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
          <div key={s.label} className="rounded-(--radius-lg) border border-[var(--line-strong)] bg-[var(--bg-elev)] px-4 py-3">
            <p className="t-10 font-medium uppercase text-[var(--text-muted)]">{s.label}</p>
            <p className="mt-0.5 t-18 font-semibold text-[var(--text)]">{s.value}</p>
            {s.sub && <p className="t-10 text-[var(--text-muted)]">{s.sub}</p>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Left: Chat */}
        <div>
          <h2 className="mb-3 t-10 font-semibold uppercase tracking-(--tracking-wide) text-[var(--text-muted)]">Chat</h2>
          <ChatWindow agentId={id} />
        </div>

        {/* Right: Details */}
        <div className="space-y-5">
          {/* System prompt */}
          <div className="rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
            <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">System Prompt</h3>
            <pre className="max-h-32 overflow-y-auto whitespace-pre-wrap font-mono t-9 leading-relaxed text-[var(--text-soft)]">
              {agent.system_prompt || "—"}
            </pre>
          </div>

          {/* Config */}
          <div className="rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
            <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">Config</h3>
            <div className="grid grid-cols-3 gap-2 t-9">
              <div>
                <span className="text-[var(--text-muted)]">Temperature</span>
                <p className="text-[var(--text-soft)]">{agent.temperature}</p>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Max tokens</span>
                <p className="text-[var(--text-soft)]">{agent.max_tokens}</p>
              </div>
              <div>
                <span className="text-[var(--text-muted)]">Top P</span>
                <p className="text-[var(--text-soft)]">{agent.top_p}</p>
              </div>
            </div>
          </div>

          {/* Skills */}
          <div className="rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
            <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">Skills</h3>
            {skills.length === 0 ? (
              <p className="t-9 text-[var(--text-muted)]">Aucun skill attribué.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {skills.map((s) => {
                  const skill = s.skills as unknown as { id: string; name: string; category: string } | null;
                  return skill ? (
                    <span key={skill.id} className="rounded-pill border border-[var(--line-strong)] px-2.5 py-0.5 t-10 font-medium text-[var(--text-muted)]">
                      {skill.name}
                    </span>
                  ) : null;
                })}
              </div>
            )}
          </div>

          {/* Memory */}
          <div className="rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
            <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">Memory</h3>
            {memories.length === 0 ? (
              <p className="t-9 text-[var(--text-muted)]">Aucune mémoire.</p>
            ) : (
              <ul className="space-y-1 t-9 text-[var(--text-soft)]">
                {memories.map((m) => (
                  <li key={m.id} className="flex justify-between gap-2">
                    <span className="truncate">
                      <span className="text-[var(--text-muted)]">{m.key}:</span> {m.value}
                    </span>
                    <span className="shrink-0 text-[var(--text-muted)]">{(m.importance * 100).toFixed(0)}%</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Recent runs */}
          <div className="rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="t-9 font-semibold uppercase text-[var(--text-muted)]">Runs récents</h3>
              <Link href={`/admin/runs?agent_id=${id}`} className="t-10 text-[var(--text-muted)] hover:text-[var(--text-muted)]">
                Tout voir →
              </Link>
            </div>
            {runs.length === 0 ? (
              <p className="t-9 text-[var(--text-muted)]">Aucun run.</p>
            ) : (
              <div className="space-y-1">
                {runs.slice(0, 5).map((r) => (
                  <Link key={r.id} href={`/admin/runs/${r.id}`} className="flex items-center justify-between rounded-(--radius-md) px-2 py-1 t-9 transition-colors hover:bg-[var(--bg-soft)]">
                    <div className="flex items-center gap-2">
                      <span className={`h-1.5 w-1.5 rounded-pill ${r.status === "completed" ? "bg-[var(--money)]" : r.status === "failed" ? "bg-[var(--danger)]" : "bg-[var(--text-muted)]"}`} />
                      <span className="text-[var(--text-muted)]">{r.kind}</span>
                    </div>
                    <span className="text-[var(--text-muted)]">
                      {new Date(r.created_at).toLocaleString("fr-FR", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>

          {/* Evaluations */}
          <div className="rounded-(--radius-sm) border border-[var(--line-strong)] bg-[var(--bg-elev)] p-5">
            <h3 className="mb-2 t-9 font-semibold uppercase text-[var(--text-muted)]">Evaluations</h3>
            {evals.length === 0 ? (
              <p className="t-9 text-[var(--text-muted)]">Aucune évaluation.</p>
            ) : (
              <ul className="space-y-1 t-9 text-[var(--text-soft)]">
                {evals.map((ev) => (
                  <li key={ev.id} className="flex justify-between gap-2">
                    <span>
                      {ev.eval_type}{" "}
                      <span className={ev.passed ? "text-[var(--money)]" : "text-[var(--danger)]"}>
                        {ev.passed ? "PASS" : "FAIL"}
                      </span>
                    </span>
                    <span className="text-[var(--text-muted)]">{(ev.score * 100).toFixed(0)}%</span>
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
