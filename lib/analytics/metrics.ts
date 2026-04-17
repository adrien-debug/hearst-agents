/**
 * Integration & Tool Metrics — computed from existing traces.
 *
 * Provides per-tool and per-agent statistics:
 * success rate, average latency, average cost, usage frequency.
 * All computed from raw trace data, no materialized views.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";
import { classifyTraceFailure, aggregateFailures, type FailureClassification } from "./failure-classifier";

type DB = SupabaseClient<Database>;

export interface ToolMetrics {
  tool_name: string;
  total_calls: number;
  successful: number;
  failed: number;
  timed_out: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  failure_breakdown: Record<string, number>;
  last_used: string | null;
}

export interface AgentMetrics {
  agent_id: string;
  total_runs: number;
  successful_runs: number;
  failed_runs: number;
  success_rate: number;
  avg_latency_ms: number;
  total_cost_usd: number;
  avg_cost_per_run: number;
  total_tokens_in: number;
  total_tokens_out: number;
  tools_used: string[];
  top_failure: string | null;
}

interface TraceRow {
  name: string;
  status: string;
  kind: string;
  error: string | null;
  output_trust: string | null;
  latency_ms: number | null;
  cost_usd: number | null;
  started_at: string;
}

export async function computeToolMetrics(
  sb: DB,
  opts: { days?: number; tool_name?: string } = {},
): Promise<ToolMetrics[]> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  let query = sb
    .from("traces")
    .select("name, status, kind, error, output_trust, latency_ms, cost_usd, started_at")
    .in("kind", ["tool_call"])
    .gte("started_at", since)
    .order("started_at", { ascending: false });

  if (opts.tool_name) {
    query = query.eq("name", opts.tool_name);
  }

  const { data: traces } = await query;
  if (!traces || traces.length === 0) return [];

  const byTool = new Map<string, TraceRow[]>();
  for (const t of traces as TraceRow[]) {
    const group = byTool.get(t.name) ?? [];
    group.push(t);
    byTool.set(t.name, group);
  }

  const results: ToolMetrics[] = [];
  for (const [toolName, toolTraces] of byTool) {
    const total = toolTraces.length;
    const successful = toolTraces.filter((t) => t.status === "completed").length;
    const failed = toolTraces.filter((t) => t.status === "failed").length;
    const timedOut = toolTraces.filter((t) => t.status === "timeout").length;

    const latencies = toolTraces
      .map((t) => t.latency_ms ?? 0)
      .filter((l) => l > 0)
      .sort((a, b) => a - b);

    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    const p95Index = Math.min(Math.floor(latencies.length * 0.95), latencies.length - 1);
    const p95Latency = latencies.length > 0 ? latencies[p95Index] : 0;

    const costs = toolTraces.map((t) => t.cost_usd ?? 0);
    const totalCost = costs.reduce((a, b) => a + b, 0);
    const avgCost = total > 0 ? totalCost / total : 0;

    const failures: FailureClassification[] = [];
    for (const t of toolTraces) {
      const c = classifyTraceFailure(t);
      if (c) failures.push(c);
    }

    results.push({
      tool_name: toolName,
      total_calls: total,
      successful,
      failed,
      timed_out: timedOut,
      success_rate: total > 0 ? Math.round((successful / total) * 1000) / 1000 : 0,
      avg_latency_ms: avgLatency,
      p95_latency_ms: p95Latency,
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
      avg_cost_usd: Math.round(avgCost * 10000) / 10000,
      failure_breakdown: aggregateFailures(failures),
      last_used: toolTraces[0]?.started_at ?? null,
    });
  }

  return results.sort((a, b) => b.total_calls - a.total_calls);
}

export async function computeAgentMetrics(
  sb: DB,
  opts: { days?: number; agent_id?: string } = {},
): Promise<AgentMetrics[]> {
  const days = opts.days ?? 30;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  let query = sb
    .from("runs")
    .select("id, agent_id, status, latency_ms, cost_usd, tokens_in, tokens_out, error")
    .not("agent_id", "is", null)
    .gte("started_at", since);

  if (opts.agent_id) {
    query = query.eq("agent_id", opts.agent_id);
  }

  const { data: runs } = await query;
  if (!runs || runs.length === 0) return [];

  const byAgent = new Map<string, typeof runs>();
  for (const r of runs) {
    const agentId = r.agent_id as string;
    const group = byAgent.get(agentId) ?? [];
    group.push(r);
    byAgent.set(agentId, group);
  }

  const results: AgentMetrics[] = [];
  for (const [agentId, agentRuns] of byAgent) {
    const total = agentRuns.length;
    const successful = agentRuns.filter((r) => r.status === "completed").length;
    const failed = agentRuns.filter((r) => r.status === "failed").length;

    const latencies = agentRuns.map((r) => r.latency_ms ?? 0).filter((l) => l > 0);
    const avgLatency = latencies.length > 0
      ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
      : 0;

    const totalCost = agentRuns.reduce((acc, r) => acc + (r.cost_usd ?? 0), 0);
    const totalTokensIn = agentRuns.reduce((acc, r) => acc + (r.tokens_in ?? 0), 0);
    const totalTokensOut = agentRuns.reduce((acc, r) => acc + (r.tokens_out ?? 0), 0);

    const runIds = agentRuns.map((r) => r.id);
    const { data: toolTraces } = await sb
      .from("traces")
      .select("name")
      .in("run_id", runIds)
      .eq("kind", "tool_call");

    const toolsUsed = [...new Set((toolTraces ?? []).map((t) => t.name))];

    const errorCounts = new Map<string, number>();
    for (const r of agentRuns) {
      if (r.error) {
        const key = r.error.slice(0, 80);
        errorCounts.set(key, (errorCounts.get(key) ?? 0) + 1);
      }
    }
    let topFailure: string | null = null;
    let maxCount = 0;
    for (const [err, count] of errorCounts) {
      if (count > maxCount) { topFailure = err; maxCount = count; }
    }

    results.push({
      agent_id: agentId,
      total_runs: total,
      successful_runs: successful,
      failed_runs: failed,
      success_rate: total > 0 ? Math.round((successful / total) * 1000) / 1000 : 0,
      avg_latency_ms: avgLatency,
      total_cost_usd: Math.round(totalCost * 10000) / 10000,
      avg_cost_per_run: total > 0 ? Math.round((totalCost / total) * 10000) / 10000 : 0,
      total_tokens_in: totalTokensIn,
      total_tokens_out: totalTokensOut,
      tools_used: toolsUsed,
      top_failure: topFailure,
    });
  }

  return results.sort((a, b) => b.total_runs - a.total_runs);
}
