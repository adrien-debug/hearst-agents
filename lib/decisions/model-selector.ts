/**
 * Model Selector — deterministic model selection with fallback.
 *
 * Same philosophy as Tool Selector:
 *   - score-based on success rate, latency, cost
 *   - goal-based selection (reliability, speed, cost, balanced)
 *   - fallback chain
 *   - no ML, no auto-action
 *
 * Operates on model_profiles data + trace metrics.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../database.types";

type DB = SupabaseClient<Database>;

export type ModelGoal = "reliability" | "speed" | "cost" | "balanced";

export interface ModelScore {
  profile_id: string;
  provider: string;
  model: string;
  score: number;
  rank: number;
  reliability: "stable" | "degraded" | "unstable" | "unknown";
  flags: string[];
  stats: {
    total_calls: number;
    success_rate: number;
    avg_latency_ms: number;
    avg_cost_usd: number;
  };
}

export interface ModelSelection {
  selected: ModelScore | null;
  fallbacks: ModelScore[];
  reason: string;
}

const WEIGHTS = {
  success_rate: 0.45,
  latency: 0.25,
  cost: 0.20,
  volume: 0.10,
};

export async function scoreModels(
  sb: DB,
  opts: { days?: number } = {},
): Promise<ModelScore[]> {
  const days = opts.days ?? 14;
  const since = new Date(Date.now() - days * 86400_000).toISOString();

  const { data: profiles } = await sb
    .from("model_profiles")
    .select("id, provider, model, cost_per_1k_in, cost_per_1k_out");

  if (!profiles || profiles.length === 0) return [];

  const { data: traces } = await sb
    .from("traces")
    .select("model_used, status, latency_ms, cost_usd")
    .eq("kind", "llm_call")
    .gte("started_at", since);

  const tracesByModel = new Map<string, typeof traces>();
  for (const t of traces ?? []) {
    if (!t.model_used) continue;
    const key = t.model_used;
    const group = tracesByModel.get(key) ?? [];
    group.push(t);
    tracesByModel.set(key, group);
  }

  const scores: ModelScore[] = [];

  for (const profile of profiles) {
    const key = `${profile.provider}/${profile.model}`;
    const modelTraces = tracesByModel.get(key) ?? [];
    const total = modelTraces.length;

    const successful = modelTraces.filter((t) => t.status === "completed").length;
    const successRate = total > 0 ? successful / total : 0;

    const latencies = modelTraces.map((t) => t.latency_ms ?? 0).filter((l) => l > 0);
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    const costs = modelTraces.map((t) => t.cost_usd ?? 0);
    const avgCost = total > 0 ? costs.reduce((a, b) => a + b, 0) / total : 0;

    scores.push({
      profile_id: profile.id,
      provider: profile.provider,
      model: profile.model,
      score: 0,
      rank: 0,
      reliability: "unknown",
      flags: [],
      stats: { total_calls: total, success_rate: successRate, avg_latency_ms: Math.round(avgLatency), avg_cost_usd: Math.round(avgCost * 10000) / 10000 },
    });
  }

  if (scores.length === 0) return [];

  const maxLatency = Math.max(...scores.map((s) => s.stats.avg_latency_ms), 1);
  const maxCost = Math.max(...scores.map((s) => s.stats.avg_cost_usd), 0.0001);
  const maxVolume = Math.max(...scores.map((s) => s.stats.total_calls), 1);

  for (const s of scores) {
    const successScore = s.stats.success_rate;
    const latencyScore = 1 - Math.min(s.stats.avg_latency_ms / maxLatency, 1);
    const costScore = 1 - Math.min(s.stats.avg_cost_usd / maxCost, 1);
    const volumeScore = Math.min(s.stats.total_calls / maxVolume, 1);

    s.score = Math.round((
      successScore * WEIGHTS.success_rate +
      latencyScore * WEIGHTS.latency +
      costScore * WEIGHTS.cost +
      volumeScore * WEIGHTS.volume
    ) * 1000) / 1000;

    if (s.stats.total_calls < 3) {
      s.reliability = "unknown";
      s.flags.push("insufficient_data");
    } else if (s.stats.success_rate < 0.7) {
      s.reliability = "unstable";
      s.flags.push("low_success_rate");
    } else if (s.stats.success_rate < 0.9) {
      s.reliability = "degraded";
      s.flags.push("below_target_success_rate");
    } else {
      s.reliability = "stable";
    }

    if (s.stats.avg_latency_ms > 15000) s.flags.push("high_latency");
    if (s.stats.avg_cost_usd > 0.05) s.flags.push("high_cost");
  }

  scores.sort((a, b) => b.score - a.score);
  scores.forEach((s, i) => { s.rank = i + 1; });

  return scores;
}

export function selectModel(
  scores: ModelScore[],
  goal: ModelGoal = "balanced",
): ModelSelection {
  const usable = scores.filter((s) => s.reliability !== "unstable");

  if (usable.length === 0) {
    return {
      selected: null,
      fallbacks: [],
      reason: scores.length === 0
        ? "No model profiles with trace data"
        : "All models are unstable",
    };
  }

  const sorted = sortByGoal(usable, goal);
  const best = sorted[0];
  const fallbacks = sorted.slice(1, 4);

  return {
    selected: best,
    fallbacks,
    reason: `Selected ${best.provider}/${best.model} (score: ${best.score}, ${best.reliability}) — goal: ${goal}`,
  };
}

function sortByGoal(models: ModelScore[], goal: ModelGoal): ModelScore[] {
  switch (goal) {
    case "reliability":
      return [...models].sort((a, b) => {
        const order = { stable: 0, degraded: 1, unknown: 2, unstable: 3 };
        const diff = order[a.reliability] - order[b.reliability];
        return diff !== 0 ? diff : b.score - a.score;
      });

    case "speed":
      return [...models].sort((a, b) => {
        if (a.flags.includes("high_latency") && !b.flags.includes("high_latency")) return 1;
        if (!a.flags.includes("high_latency") && b.flags.includes("high_latency")) return -1;
        return b.score - a.score;
      });

    case "cost":
      return [...models].sort((a, b) => {
        if (a.flags.includes("high_cost") && !b.flags.includes("high_cost")) return 1;
        if (!a.flags.includes("high_cost") && b.flags.includes("high_cost")) return -1;
        return b.score - a.score;
      });

    case "balanced":
    default:
      return [...models].sort((a, b) => b.score - a.score);
  }
}
