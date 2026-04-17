/**
 * Feedback Loop — generates actionable improvement signals.
 *
 * Analyzes agent metrics, tool scores, and failure patterns
 * to produce structured recommendations for:
 *   - agent configuration adjustments
 *   - prompt tuning signals
 *   - guard policy tightening/loosening
 *   - tool replacement suggestions
 *
 * No auto-apply. Returns signals that operators can review and act on.
 */

import type { AgentMetrics } from "./metrics";
import type { ToolScore } from "./tool-ranking";
import type { FailureClassification, FailureCategory } from "./failure-classifier";

export type FeedbackKind =
  | "agent_config"
  | "prompt_tuning"
  | "guard_policy"
  | "tool_replacement"
  | "cost_optimization"
  | "reliability_alert";

export type FeedbackPriority = "low" | "medium" | "high" | "critical";

export interface FeedbackSignal {
  kind: FeedbackKind;
  priority: FeedbackPriority;
  target_id: string;
  target_type: "agent" | "tool" | "integration" | "global";
  title: string;
  description: string;
  suggestion: string;
  data: Record<string, unknown>;
}

export function generateAgentFeedback(agent: AgentMetrics): FeedbackSignal[] {
  const signals: FeedbackSignal[] = [];

  if (agent.success_rate < 0.7) {
    signals.push({
      kind: "reliability_alert",
      priority: "critical",
      target_id: agent.agent_id,
      target_type: "agent",
      title: `Agent success rate critically low: ${(agent.success_rate * 100).toFixed(1)}%`,
      description: `${agent.failed_runs}/${agent.total_runs} runs failed. Top error: ${agent.top_failure ?? "unknown"}`,
      suggestion: "Review system prompt, check tool availability, inspect recent failed traces",
      data: { success_rate: agent.success_rate, failed_runs: agent.failed_runs },
    });
  } else if (agent.success_rate < 0.9) {
    signals.push({
      kind: "reliability_alert",
      priority: "medium",
      target_id: agent.agent_id,
      target_type: "agent",
      title: `Agent success rate below target: ${(agent.success_rate * 100).toFixed(1)}%`,
      description: `${agent.failed_runs} failures detected`,
      suggestion: "Analyze failure patterns, consider adding retry logic or fallback tools",
      data: { success_rate: agent.success_rate },
    });
  }

  if (agent.avg_cost_per_run > 0.5) {
    signals.push({
      kind: "cost_optimization",
      priority: "high",
      target_id: agent.agent_id,
      target_type: "agent",
      title: `High average cost: $${agent.avg_cost_per_run.toFixed(4)}/run`,
      description: `Total cost: $${agent.total_cost_usd.toFixed(4)} over ${agent.total_runs} runs`,
      suggestion: "Consider a smaller model, reduce max_tokens, or set cost_budget_per_run",
      data: { avg_cost: agent.avg_cost_per_run, total_cost: agent.total_cost_usd },
    });
  }

  if (agent.avg_latency_ms > 30_000) {
    signals.push({
      kind: "agent_config",
      priority: "medium",
      target_id: agent.agent_id,
      target_type: "agent",
      title: `High average latency: ${(agent.avg_latency_ms / 1000).toFixed(1)}s`,
      description: "Runs are taking longer than expected",
      suggestion: "Check tool latencies, consider streaming, reduce context window",
      data: { avg_latency_ms: agent.avg_latency_ms },
    });
  }

  return signals;
}

export function generateToolFeedback(scores: ToolScore[]): FeedbackSignal[] {
  const signals: FeedbackSignal[] = [];

  for (const tool of scores) {
    if (tool.reliability === "unstable") {
      signals.push({
        kind: "tool_replacement",
        priority: "high",
        target_id: tool.tool_name,
        target_type: "tool",
        title: `Tool "${tool.tool_name}" is unstable`,
        description: `Score: ${tool.score}, Flags: ${tool.flags.join(", ")}`,
        suggestion: "Replace with a more reliable alternative or fix the underlying issue",
        data: { score: tool.score, flags: tool.flags },
      });
    }

    if (tool.flags.includes("high_cost")) {
      signals.push({
        kind: "cost_optimization",
        priority: "medium",
        target_id: tool.tool_name,
        target_type: "tool",
        title: `Tool "${tool.tool_name}" has high cost`,
        description: "Average cost per call exceeds threshold",
        suggestion: "Consider caching results, reducing call frequency, or finding a cheaper alternative",
        data: { flags: tool.flags },
      });
    }

    if (tool.flags.includes("frequent_timeouts")) {
      signals.push({
        kind: "agent_config",
        priority: "medium",
        target_id: tool.tool_name,
        target_type: "tool",
        title: `Tool "${tool.tool_name}" has frequent timeouts`,
        description: "More than 10% of calls are timing out",
        suggestion: "Increase timeout_ms, check endpoint health, or add retry with backoff",
        data: { flags: tool.flags },
      });
    }
  }

  return signals;
}

export function generateFailureFeedback(
  failures: FailureClassification[],
  agentId?: string,
): FeedbackSignal[] {
  const signals: FeedbackSignal[] = [];
  const targetId = agentId ?? "global";
  const targetType = agentId ? "agent" as const : "global" as const;

  const counts = new Map<FailureCategory, number>();
  for (const f of failures) {
    counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
  }

  const total = failures.length;
  if (total === 0) return signals;

  const guardFailures = counts.get("guard_failure") ?? 0;
  if (guardFailures > 0 && guardFailures / total > 0.2) {
    signals.push({
      kind: "guard_policy",
      priority: "high",
      target_id: targetId,
      target_type: targetType,
      title: `${guardFailures} guard failures (${((guardFailures / total) * 100).toFixed(0)}% of errors)`,
      description: "Guard policies are rejecting a significant portion of outputs",
      suggestion: "Review guard_policy rules — may be too strict, or the model needs better prompting",
      data: { guard_failures: guardFailures, total_failures: total },
    });
  }

  const costFailures = counts.get("cost_exceeded") ?? 0;
  if (costFailures > 0) {
    signals.push({
      kind: "cost_optimization",
      priority: "critical",
      target_id: targetId,
      target_type: targetType,
      title: `${costFailures} runs hit cost limit`,
      description: "Budget enforcement is stopping runs before completion",
      suggestion: "Increase cost_budget_per_run, use a cheaper model, or optimize prompt length",
      data: { cost_failures: costFailures },
    });
  }

  const providerErrors = counts.get("provider_error") ?? 0;
  if (providerErrors > 2 && providerErrors / total > 0.15) {
    signals.push({
      kind: "prompt_tuning",
      priority: "high",
      target_id: targetId,
      target_type: targetType,
      title: `${providerErrors} provider errors`,
      description: "LLM provider is failing frequently — may indicate prompt issues or provider instability",
      suggestion: "Check for prompt length limits, content policy violations, or switch to fallback model",
      data: { provider_errors: providerErrors },
    });
  }

  return signals;
}
