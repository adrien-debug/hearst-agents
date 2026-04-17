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

export interface ToolRecommendation {
  recommended: string | null;
  reason: string;
  alternatives: { tool_name: string; score: number }[];
  unstable: string[];
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

export function recommendTool(
  scores: ToolScore[],
  category?: string,
): ToolRecommendation {
  let candidates = scores.filter((s) => s.reliability !== "unstable");

  if (category) {
    const filtered = candidates.filter((s) => s.tool_name.startsWith(category));
    if (filtered.length > 0) candidates = filtered;
  }

  const stableOnly = candidates.filter((s) => s.reliability === "stable");
  const pool = stableOnly.length > 0 ? stableOnly : candidates;

  const unstable = scores
    .filter((s) => s.reliability === "unstable")
    .map((s) => s.tool_name);

  if (pool.length === 0) {
    return {
      recommended: null,
      reason: "No stable tools available",
      alternatives: [],
      unstable,
    };
  }

  const best = pool[0];

  return {
    recommended: best.tool_name,
    reason: `Highest score (${best.score}) with ${best.reliability} reliability`,
    alternatives: pool.slice(1, 4).map((s) => ({
      tool_name: s.tool_name,
      score: s.score,
    })),
    unstable,
  };
}

export function detectDrift(
  currentMetrics: ToolMetrics[],
  previousMetrics: ToolMetrics[],
): { tool_name: string; metric: string; change: number; alert: boolean }[] {
  const drifts: { tool_name: string; metric: string; change: number; alert: boolean }[] = [];

  for (const current of currentMetrics) {
    const previous = previousMetrics.find((p) => p.tool_name === current.tool_name);
    if (!previous || previous.total_calls < THRESHOLDS.min_calls_for_ranking) continue;

    const successDelta = current.success_rate - previous.success_rate;
    if (Math.abs(successDelta) > 0.1) {
      drifts.push({
        tool_name: current.tool_name,
        metric: "success_rate",
        change: Math.round(successDelta * 1000) / 1000,
        alert: successDelta < -0.1,
      });
    }

    if (previous.avg_latency_ms > 0) {
      const latencyRatio = current.avg_latency_ms / previous.avg_latency_ms;
      if (latencyRatio > 2 || latencyRatio < 0.5) {
        drifts.push({
          tool_name: current.tool_name,
          metric: "avg_latency_ms",
          change: Math.round((latencyRatio - 1) * 100) / 100,
          alert: latencyRatio > 2,
        });
      }
    }

    if (previous.avg_cost_usd > 0) {
      const costRatio = current.avg_cost_usd / previous.avg_cost_usd;
      if (costRatio > 1.5) {
        drifts.push({
          tool_name: current.tool_name,
          metric: "avg_cost_usd",
          change: Math.round((costRatio - 1) * 100) / 100,
          alert: true,
        });
      }
    }
  }

  return drifts;
}
