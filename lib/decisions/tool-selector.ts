/**
 * Tool Selector — deterministic tool selection with fallback.
 *
 * Uses cached tool scores to pick the best tool for a given intent.
 * Supports:
 *   - selection by category/prefix (e.g. "integration:http")
 *   - selection by optimization goal (reliability, speed, cost)
 *   - automatic fallback chain when primary is unstable
 *   - explicit "no suitable tool" signal
 *
 * No ML. Deterministic score-based logic.
 */

import type { ToolScore } from "../analytics/tool-ranking";

export type SelectionGoal = "reliability" | "speed" | "cost" | "balanced";

export interface SelectionRequest {
  candidates: ToolScore[];
  goal?: SelectionGoal;
  category?: string;
  exclude?: string[];
}

export interface SelectionResult {
  selected: string | null;
  score: number;
  reliability: ToolScore["reliability"];
  fallbacks: string[];
  reason: string;
  excluded_unstable: string[];
}

export function selectTool(req: SelectionRequest): SelectionResult {
  let pool = [...req.candidates];

  if (req.category) {
    const filtered = pool.filter((s) => s.tool_name.startsWith(req.category!));
    if (filtered.length > 0) pool = filtered;
  }

  if (req.exclude && req.exclude.length > 0) {
    pool = pool.filter((s) => !req.exclude!.includes(s.tool_name));
  }

  const unstable = pool.filter((s) => s.reliability === "unstable").map((s) => s.tool_name);
  const usable = pool.filter((s) => s.reliability !== "unstable");

  if (usable.length === 0) {
    return {
      selected: null,
      score: 0,
      reliability: "unstable",
      fallbacks: [],
      reason: pool.length === 0
        ? "No tools match selection criteria"
        : "All matching tools are unstable",
      excluded_unstable: unstable,
    };
  }

  const sorted = sortByGoal(usable, req.goal ?? "balanced");
  const best = sorted[0];
  const fallbacks = sorted.slice(1, 4).map((s) => s.tool_name);

  return {
    selected: best.tool_name,
    score: best.score,
    reliability: best.reliability,
    fallbacks,
    reason: buildReason(best, req.goal ?? "balanced"),
    excluded_unstable: unstable,
  };
}

function sortByGoal(tools: ToolScore[], goal: SelectionGoal): ToolScore[] {
  switch (goal) {
    case "reliability":
      return [...tools].sort((a, b) => {
        const reliabilityOrder = { stable: 0, degraded: 1, unknown: 2, unstable: 3 };
        const diff = reliabilityOrder[a.reliability] - reliabilityOrder[b.reliability];
        return diff !== 0 ? diff : b.score - a.score;
      });

    case "speed":
      return [...tools].sort((a, b) => {
        if (a.flags.includes("high_p95_latency") && !b.flags.includes("high_p95_latency")) return 1;
        if (!a.flags.includes("high_p95_latency") && b.flags.includes("high_p95_latency")) return -1;
        return b.score - a.score;
      });

    case "cost":
      return [...tools].sort((a, b) => {
        if (a.flags.includes("high_cost") && !b.flags.includes("high_cost")) return 1;
        if (!a.flags.includes("high_cost") && b.flags.includes("high_cost")) return -1;
        return b.score - a.score;
      });

    case "balanced":
    default:
      return [...tools].sort((a, b) => b.score - a.score);
  }
}

function buildReason(tool: ToolScore, goal: SelectionGoal): string {
  const goalLabel = goal === "balanced" ? "highest composite score" : `optimized for ${goal}`;
  return `Selected "${tool.tool_name}" (score: ${tool.score}, ${tool.reliability}) — ${goalLabel}`;
}
