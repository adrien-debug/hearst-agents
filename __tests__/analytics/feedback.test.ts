import { describe, it, expect } from "vitest";
import {
  generateAgentFeedback,
  generateToolFeedback,
  generateFailureFeedback,
} from "@/lib/analytics/feedback";
import type { AgentMetrics } from "@/lib/analytics/metrics";
import type { ToolScore } from "@/lib/analytics/tool-ranking";
import type { FailureClassification } from "@/lib/analytics/failure-classifier";

describe("generateAgentFeedback", () => {
  const baseAgent: AgentMetrics = {
    agent_id: "agent-1",
    total_runs: 100,
    successful_runs: 95,
    failed_runs: 5,
    success_rate: 0.95,
    avg_latency_ms: 2000,
    total_cost_usd: 1.0,
    avg_cost_per_run: 0.01,
    total_tokens_in: 50000,
    total_tokens_out: 10000,
    tools_used: ["tool:fetch"],
    top_failure: null,
  };

  it("returns no signals for healthy agent", () => {
    const signals = generateAgentFeedback(baseAgent);
    expect(signals.length).toBe(0);
  });

  it("generates critical alert for low success rate", () => {
    const agent = { ...baseAgent, success_rate: 0.5, failed_runs: 50 };
    const signals = generateAgentFeedback(agent);
    expect(signals.some((s) => s.priority === "critical")).toBe(true);
  });

  it("generates cost signal for expensive agent", () => {
    const agent = { ...baseAgent, avg_cost_per_run: 1.5, total_cost_usd: 150 };
    const signals = generateAgentFeedback(agent);
    expect(signals.some((s) => s.kind === "cost_optimization")).toBe(true);
  });

  it("generates latency signal for slow agent", () => {
    const agent = { ...baseAgent, avg_latency_ms: 45000 };
    const signals = generateAgentFeedback(agent);
    expect(signals.some((s) => s.kind === "agent_config")).toBe(true);
  });
});

describe("generateToolFeedback", () => {
  it("flags unstable tools", () => {
    const scores: ToolScore[] = [
      { tool_name: "tool:bad", score: 0.3, rank: 1, reliability: "unstable", flags: ["low_success_rate"] },
    ];
    const signals = generateToolFeedback(scores);
    expect(signals.some((s) => s.kind === "tool_replacement")).toBe(true);
  });

  it("flags costly tools", () => {
    const scores: ToolScore[] = [
      { tool_name: "tool:expensive", score: 0.8, rank: 1, reliability: "stable", flags: ["high_cost"] },
    ];
    const signals = generateToolFeedback(scores);
    expect(signals.some((s) => s.kind === "cost_optimization")).toBe(true);
  });

  it("returns no signals for healthy tools", () => {
    const scores: ToolScore[] = [
      { tool_name: "tool:good", score: 0.95, rank: 1, reliability: "stable", flags: [] },
    ];
    expect(generateToolFeedback(scores).length).toBe(0);
  });
});

describe("generateFailureFeedback", () => {
  it("generates guard policy signal", () => {
    const failures: FailureClassification[] = Array(5).fill({
      category: "guard_failure",
      severity: "high",
      retryable: false,
      details: "guard failed",
      source: "trace",
    });
    const signals = generateFailureFeedback(failures);
    expect(signals.some((s) => s.kind === "guard_policy")).toBe(true);
  });

  it("generates cost signal for budget hits", () => {
    const failures: FailureClassification[] = [
      { category: "cost_exceeded", severity: "critical", retryable: false, details: "", source: "run" },
    ];
    const signals = generateFailureFeedback(failures);
    expect(signals.some((s) => s.kind === "cost_optimization")).toBe(true);
  });

  it("returns empty for no failures", () => {
    expect(generateFailureFeedback([]).length).toBe(0);
  });
});
