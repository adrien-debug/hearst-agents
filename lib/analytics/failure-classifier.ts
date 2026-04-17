/**
 * Failure Classifier — categorizes trace/run failures from existing data.
 *
 * Reads status, error message, kind, output_trust, cost, latency
 * to produce a structured classification. No ML, pure deterministic rules.
 */

export type FailureCategory =
  | "tool_failure"
  | "timeout"
  | "cost_exceeded"
  | "guard_failure"
  | "invalid_output"
  | "provider_error"
  | "rate_limited"
  | "auth_error"
  | "network_error"
  | "unknown";

export interface FailureClassification {
  category: FailureCategory;
  severity: "low" | "medium" | "high" | "critical";
  retryable: boolean;
  details: string;
  source: "trace" | "run";
}

export interface TraceData {
  status: string;
  kind: string;
  name: string;
  error: string | null;
  output_trust: string | null;
  cost_usd: number | null;
  latency_ms: number | null;
}

export interface RunData {
  status: string;
  error: string | null;
  cost_usd: number | null;
  cost_budget_usd: number | null;
  latency_ms: number | null;
  timeout_ms: number | null;
}

export function classifyTraceFailure(trace: TraceData): FailureClassification | null {
  if (trace.status === "completed" && trace.output_trust !== "guard_failed") {
    return null;
  }

  if (trace.status === "timeout") {
    return {
      category: "timeout",
      severity: "medium",
      retryable: true,
      details: trace.error ?? `Trace "${trace.name}" timed out at ${trace.latency_ms}ms`,
      source: "trace",
    };
  }

  if (trace.output_trust === "guard_failed") {
    return {
      category: "guard_failure",
      severity: "high",
      retryable: false,
      details: trace.error ?? `Output guard failed on "${trace.name}"`,
      source: "trace",
    };
  }

  const errorLower = (trace.error ?? "").toLowerCase();

  if (errorLower.includes("cost_limit") || errorLower.includes("budget")) {
    return {
      category: "cost_exceeded",
      severity: "critical",
      retryable: false,
      details: trace.error ?? "Cost limit exceeded",
      source: "trace",
    };
  }

  if (errorLower.includes("rate") && errorLower.includes("limit")) {
    return {
      category: "rate_limited",
      severity: "medium",
      retryable: true,
      details: trace.error ?? "Rate limited",
      source: "trace",
    };
  }

  if (errorLower.includes("401") || errorLower.includes("403") || errorLower.includes("unauthorized") || errorLower.includes("forbidden")) {
    return {
      category: "auth_error",
      severity: "high",
      retryable: false,
      details: trace.error ?? "Authentication/authorization error",
      source: "trace",
    };
  }

  if (errorLower.includes("econnrefused") || errorLower.includes("enotfound") || errorLower.includes("fetch failed") || errorLower.includes("network")) {
    return {
      category: "network_error",
      severity: "medium",
      retryable: true,
      details: trace.error ?? "Network error",
      source: "trace",
    };
  }

  if (trace.kind === "tool_call" && trace.status === "failed") {
    return {
      category: "tool_failure",
      severity: "medium",
      retryable: true,
      details: trace.error ?? `Tool "${trace.name}" failed`,
      source: "trace",
    };
  }

  if (trace.kind === "llm_call" && trace.status === "failed") {
    return {
      category: "provider_error",
      severity: "high",
      retryable: true,
      details: trace.error ?? `LLM provider error on "${trace.name}"`,
      source: "trace",
    };
  }

  if (trace.status === "failed") {
    return {
      category: "unknown",
      severity: "medium",
      retryable: false,
      details: trace.error ?? `Trace "${trace.name}" failed`,
      source: "trace",
    };
  }

  if (trace.output_trust === "guard_failed") {
    return {
      category: "invalid_output",
      severity: "medium",
      retryable: false,
      details: `Output classified as invalid for "${trace.name}"`,
      source: "trace",
    };
  }

  return null;
}

export function classifyRunFailure(run: RunData): FailureClassification | null {
  if (run.status === "completed") return null;

  if (run.status === "timeout") {
    return {
      category: "timeout",
      severity: "high",
      retryable: true,
      details: run.error ?? `Run timed out at ${run.latency_ms}ms (limit: ${run.timeout_ms}ms)`,
      source: "run",
    };
  }

  if (run.status === "cancelled") {
    return {
      category: "unknown",
      severity: "low",
      retryable: false,
      details: "Run was cancelled",
      source: "run",
    };
  }

  const errorLower = (run.error ?? "").toLowerCase();

  if (errorLower.includes("cost_limit") || errorLower.includes("budget")) {
    return {
      category: "cost_exceeded",
      severity: "critical",
      retryable: false,
      details: run.error ?? `Cost exceeded budget of $${run.cost_budget_usd}`,
      source: "run",
    };
  }

  return {
    category: "unknown",
    severity: "medium",
    retryable: false,
    details: run.error ?? "Run failed",
    source: "run",
  };
}

export function aggregateFailures(classifications: FailureClassification[]): Record<FailureCategory, number> {
  const counts: Record<FailureCategory, number> = {
    tool_failure: 0,
    timeout: 0,
    cost_exceeded: 0,
    guard_failure: 0,
    invalid_output: 0,
    provider_error: 0,
    rate_limited: 0,
    auth_error: 0,
    network_error: 0,
    unknown: 0,
  };
  for (const c of classifications) {
    counts[c.category]++;
  }
  return counts;
}
