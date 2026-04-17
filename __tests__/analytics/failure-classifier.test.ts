import { describe, it, expect } from "vitest";
import {
  classifyTraceFailure,
  classifyRunFailure,
  aggregateFailures,
  type TraceData,
  type RunData,
} from "@/lib/analytics/failure-classifier";

const baseTrace: TraceData = {
  status: "completed",
  kind: "llm_call",
  name: "test-trace",
  error: null,
  output_trust: "unverified",
  cost_usd: 0.01,
  latency_ms: 500,
};

describe("classifyTraceFailure", () => {
  it("returns null for successful trace", () => {
    expect(classifyTraceFailure(baseTrace)).toBeNull();
  });

  it("classifies timeout", () => {
    const trace = { ...baseTrace, status: "timeout", error: "timed out after 30000ms" };
    const result = classifyTraceFailure(trace);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("timeout");
    expect(result!.retryable).toBe(true);
  });

  it("classifies guard failure", () => {
    const trace = { ...baseTrace, output_trust: "guard_failed" };
    const result = classifyTraceFailure(trace);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("guard_failure");
    expect(result!.severity).toBe("high");
  });

  it("classifies cost exceeded", () => {
    const trace = { ...baseTrace, status: "failed", error: "COST_LIMIT_EXCEEDED: budget exceeded" };
    const result = classifyTraceFailure(trace);
    expect(result).not.toBeNull();
    expect(result!.category).toBe("cost_exceeded");
    expect(result!.severity).toBe("critical");
  });

  it("classifies rate limit", () => {
    const trace = { ...baseTrace, status: "failed", error: "Rate limit exceeded" };
    const result = classifyTraceFailure(trace);
    expect(result!.category).toBe("rate_limited");
    expect(result!.retryable).toBe(true);
  });

  it("classifies auth error (401)", () => {
    const trace = { ...baseTrace, status: "failed", error: "HTTP 401 Unauthorized" };
    const result = classifyTraceFailure(trace);
    expect(result!.category).toBe("auth_error");
    expect(result!.retryable).toBe(false);
  });

  it("classifies network error", () => {
    const trace = { ...baseTrace, status: "failed", error: "fetch failed: ECONNREFUSED" };
    const result = classifyTraceFailure(trace);
    expect(result!.category).toBe("network_error");
    expect(result!.retryable).toBe(true);
  });

  it("classifies tool_call failure", () => {
    const trace = { ...baseTrace, kind: "tool_call", status: "failed", error: "Tool returned 500" };
    const result = classifyTraceFailure(trace);
    expect(result!.category).toBe("tool_failure");
  });

  it("classifies llm_call failure as provider_error", () => {
    const trace = { ...baseTrace, kind: "llm_call", status: "failed", error: "OpenAI error" };
    const result = classifyTraceFailure(trace);
    expect(result!.category).toBe("provider_error");
  });
});

describe("classifyRunFailure", () => {
  const baseRun: RunData = {
    status: "completed",
    error: null,
    cost_usd: 0.05,
    cost_budget_usd: 1.0,
    latency_ms: 3000,
    timeout_ms: 300000,
  };

  it("returns null for completed run", () => {
    expect(classifyRunFailure(baseRun)).toBeNull();
  });

  it("classifies run timeout", () => {
    const run = { ...baseRun, status: "timeout", error: "Run timed out" };
    const result = classifyRunFailure(run);
    expect(result!.category).toBe("timeout");
    expect(result!.severity).toBe("high");
  });

  it("classifies cost exceeded run", () => {
    const run = { ...baseRun, status: "failed", error: "COST_LIMIT_EXCEEDED" };
    const result = classifyRunFailure(run);
    expect(result!.category).toBe("cost_exceeded");
    expect(result!.severity).toBe("critical");
  });

  it("classifies cancelled run", () => {
    const run = { ...baseRun, status: "cancelled" };
    const result = classifyRunFailure(run);
    expect(result!.category).toBe("unknown");
    expect(result!.severity).toBe("low");
  });
});

describe("aggregateFailures", () => {
  it("counts by category", () => {
    const failures = [
      { category: "timeout" as const, severity: "medium" as const, retryable: true, details: "", source: "trace" as const },
      { category: "timeout" as const, severity: "medium" as const, retryable: true, details: "", source: "trace" as const },
      { category: "guard_failure" as const, severity: "high" as const, retryable: false, details: "", source: "trace" as const },
    ];
    const result = aggregateFailures(failures);
    expect(result.timeout).toBe(2);
    expect(result.guard_failure).toBe(1);
    expect(result.tool_failure).toBe(0);
  });
});
