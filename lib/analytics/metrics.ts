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
