/**
 * Tool Ranking — score, rank, and assess tool reliability.
 *
 * Computes a composite score from success rate, latency, cost.
 * Identifies unstable tools and recommends the best alternative.
 * Pure logic, no ML. Weights are explicit and tunable.
 */

import type { ToolMetrics } from "./metrics";

export interface ToolScore {
  tool_name: string;
  score: number;
  rank: number;
  reliability: "stable" | "degraded" | "unstable" | "unknown";
  flags: string[];
}

const WEIGHTS = {
  success_rate: 0.50,
  latency: 0.20,
  cost: 0.15,
  volume: 0.15,
};

const THRESHOLDS = {
  unstable_success_rate: 0.7,
  degraded_success_rate: 0.9,
  high_p95_latency_ms: 10_000,
  high_avg_cost_usd: 0.1,
  min_calls_for_ranking: 3,
};

export function scoreTools(metrics: ToolMetrics[]): ToolScore[] {
  if (metrics.length === 0) return [];

  const maxLatency = Math.max(...metrics.map((m) => m.avg_latency_ms), 1);
  const maxCost = Math.max(...metrics.map((m) => m.avg_cost_usd), 0.0001);
  const maxVolume = Math.max(...metrics.map((m) => m.total_calls), 1);

  const scored = metrics.map((m) => {
    const flags: string[] = [];

    const successScore = m.success_rate;

    const latencyScore = 1 - Math.min(m.avg_latency_ms / maxLatency, 1);

    const costScore = 1 - Math.min(m.avg_cost_usd / maxCost, 1);

    const volumeScore = Math.min(m.total_calls / maxVolume, 1);

    const score = Math.round((
      successScore * WEIGHTS.success_rate +
      latencyScore * WEIGHTS.latency +
      costScore * WEIGHTS.cost +
      volumeScore * WEIGHTS.volume
    ) * 1000) / 1000;

    let reliability: ToolScore["reliability"] = "stable";
    if (m.total_calls < THRESHOLDS.min_calls_for_ranking) {
      reliability = "unknown";
      flags.push("insufficient_data");
    } else if (m.success_rate < THRESHOLDS.unstable_success_rate) {
      reliability = "unstable";
      flags.push("low_success_rate");
    } else if (m.success_rate < THRESHOLDS.degraded_success_rate) {
      reliability = "degraded";
      flags.push("below_target_success_rate");
    }

    if (m.p95_latency_ms > THRESHOLDS.high_p95_latency_ms) {
      flags.push("high_p95_latency");
    }

    if (m.avg_cost_usd > THRESHOLDS.high_avg_cost_usd) {
      flags.push("high_cost");
    }

    if (m.timed_out > 0 && m.timed_out / m.total_calls > 0.1) {
      flags.push("frequent_timeouts");
    }

    return {
      tool_name: m.tool_name,
      score,
      rank: 0,
      reliability,
      flags,
    };
  });

  scored.sort((a, b) => b.score - a.score);
  scored.forEach((s, i) => { s.rank = i + 1; });

  return scored;
}
