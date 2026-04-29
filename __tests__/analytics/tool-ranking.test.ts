import { describe, it, expect } from "vitest";
import { scoreTools } from "@/lib/analytics/tool-ranking";
import type { ToolMetrics } from "@/lib/analytics/metrics";

function makeMetrics(overrides: Partial<ToolMetrics> & { tool_name: string }): ToolMetrics {
  return {
    total_calls: 100,
    successful: 95,
    failed: 5,
    timed_out: 0,
    success_rate: 0.95,
    avg_latency_ms: 500,
    p95_latency_ms: 1200,
    total_cost_usd: 0.5,
    avg_cost_usd: 0.005,
    failure_breakdown: {},
    last_used: new Date().toISOString(),
    ...overrides,
  };
}

describe("scoreTools", () => {
  it("returns empty for no metrics", () => {
    expect(scoreTools([])).toEqual([]);
  });

  it("scores and ranks tools", () => {
    const metrics = [
      makeMetrics({ tool_name: "tool:fast", success_rate: 1.0, avg_latency_ms: 100, avg_cost_usd: 0.001 }),
      makeMetrics({ tool_name: "tool:slow", success_rate: 0.8, avg_latency_ms: 5000, avg_cost_usd: 0.05 }),
    ];
    const scores = scoreTools(metrics);
    expect(scores.length).toBe(2);
    expect(scores[0].tool_name).toBe("tool:fast");
    expect(scores[0].rank).toBe(1);
    expect(scores[0].score).toBeGreaterThan(scores[1].score);
  });

  it("flags unstable tools", () => {
    const metrics = [
      makeMetrics({ tool_name: "tool:broken", success_rate: 0.5, total_calls: 20, successful: 10, failed: 10 }),
    ];
    const scores = scoreTools(metrics);
    expect(scores[0].reliability).toBe("unstable");
    expect(scores[0].flags).toContain("low_success_rate");
  });

  it("flags insufficient data", () => {
    const metrics = [
      makeMetrics({ tool_name: "tool:new", total_calls: 2, success_rate: 1.0 }),
    ];
    const scores = scoreTools(metrics);
    expect(scores[0].reliability).toBe("unknown");
    expect(scores[0].flags).toContain("insufficient_data");
  });

  it("flags high p95 latency", () => {
    const metrics = [
      makeMetrics({ tool_name: "tool:laggy", p95_latency_ms: 15000 }),
    ];
    const scores = scoreTools(metrics);
    expect(scores[0].flags).toContain("high_p95_latency");
  });

  it("flags frequent timeouts", () => {
    const metrics = [
      makeMetrics({ tool_name: "tool:timeout", timed_out: 15, total_calls: 100 }),
    ];
    const scores = scoreTools(metrics);
    expect(scores[0].flags).toContain("frequent_timeouts");
  });
});
