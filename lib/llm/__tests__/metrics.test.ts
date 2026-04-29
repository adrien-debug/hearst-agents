import { describe, it, expect, beforeEach } from "vitest";
import {
  LLMMetricsAggregator,
  percentile,
  defaultMetrics,
  getMetrics,
  LATENCY_WINDOW_SIZE,
  DEFAULT_PRICING,
} from "../metrics";

describe("percentile()", () => {
  it("returns null for empty array", () => {
    expect(percentile([], 0.5)).toBeNull();
  });

  it("returns the only element for length 1", () => {
    expect(percentile([42], 0.95)).toBe(42);
  });

  it("computes p50 by linear interpolation", () => {
    expect(percentile([1, 2, 3, 4], 0.5)).toBe(2.5);
  });

  it("computes p95 / p99 close to the upper end", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i + 1);
    expect(percentile(arr, 0.95)).toBeCloseTo(95.05, 1);
    expect(percentile(arr, 0.99)).toBeCloseTo(99.01, 1);
  });

  it("clamps q outside [0, 1]", () => {
    expect(percentile([10, 20, 30], -1)).toBe(10);
    expect(percentile([10, 20, 30], 2)).toBe(30);
  });
});

describe("LLMMetricsAggregator — recordCall", () => {
  let agg: LLMMetricsAggregator;

  beforeEach(() => {
    agg = new LLMMetricsAggregator();
  });

  it("aggregates totals and latencies for a single provider", () => {
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
    });
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 200,
      tokensIn: 2000,
      tokensOut: 1000,
    });

    const snap = agg.getMetrics();
    expect(snap.providers).toHaveLength(1);
    const p = snap.providers[0];
    expect(p.provider).toBe("anthropic");
    expect(p.totalCalls).toBe(2);
    expect(p.tokens.totalIn).toBe(3000);
    expect(p.tokens.totalOut).toBe(1500);
    expect(p.latency.p50).toBe(150);
  });

  it("isolates providers", () => {
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
    });
    agg.recordCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 500,
      tokensIn: 100,
      tokensOut: 50,
    });

    const snap = agg.getMetrics();
    expect(snap.providers).toHaveLength(2);
    const anthropic = snap.providers.find((p) => p.provider === "anthropic")!;
    const openai = snap.providers.find((p) => p.provider === "openai")!;
    expect(anthropic.totalCalls).toBe(1);
    expect(openai.totalCalls).toBe(1);
    expect(anthropic.latency.p50).toBe(100);
    expect(openai.latency.p50).toBe(500);
  });

  it("caps the rolling window at LATENCY_WINDOW_SIZE", () => {
    for (let i = 0; i < LATENCY_WINDOW_SIZE + 50; i++) {
      agg.recordCall({
        provider: "openai",
        model: "gpt-4o",
        latencyMs: i,
        tokensIn: 1,
        tokensOut: 1,
      });
    }
    const snap = agg.getMetrics();
    const openai = snap.providers[0];
    expect(openai.totalCalls).toBe(LATENCY_WINDOW_SIZE + 50);
    // Window keeps only the last LATENCY_WINDOW_SIZE samples (50..149)
    expect(openai.latency.samples).toBe(LATENCY_WINDOW_SIZE);
    // p50 of [50..149] is ~99.5 (linear interpolation between sorted positions 49 and 50)
    expect(openai.latency.p50).toBeCloseTo(99.5, 1);
  });

  it("uses provided costUsd when present", () => {
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
      costUsd: 0.05,
    });
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
      costUsd: 0.07,
    });

    const snap = agg.getMetrics();
    expect(snap.providers[0].cost.totalUsd).toBeCloseTo(0.12, 4);
  });

  it("falls back to DEFAULT_PRICING when cost not provided", () => {
    const pricing = DEFAULT_PRICING["claude-sonnet-4"];
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
    });

    const expected = (1000 / 1000) * pricing.in + (500 / 1000) * pricing.out;
    const snap = agg.getMetrics();
    expect(snap.providers[0].cost.totalUsd).toBeCloseTo(expected, 4);
  });

  it("returns 0 cost for unknown model with no override", () => {
    agg.recordCall({
      provider: "openai",
      model: "completely-unknown-model",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
    });
    expect(agg.getMetrics().providers[0].cost.totalUsd).toBe(0);
  });

  it("computes Anthropic cache hit rate", () => {
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
      cacheReadTokens: 800,
    });
    const snap = agg.getMetrics();
    expect(snap.providers[0].tokens.cacheHitRate).not.toBeNull();
    expect(snap.providers[0].tokens.cacheHitRate!).toBeGreaterThan(0);
  });

  it("returns null cache hit rate when no cache reads recorded", () => {
    agg.recordCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 100,
      tokensIn: 1000,
      tokensOut: 500,
    });
    expect(agg.getMetrics().providers[0].tokens.cacheHitRate).toBeNull();
  });

  it("validates input via Zod and throws on negative latency", () => {
    expect(() =>
      agg.recordCall({
        provider: "anthropic",
        model: "claude-sonnet-4",
        latencyMs: -1,
        tokensIn: 0,
        tokensOut: 0,
      }),
    ).toThrow();
  });

  it("validates input via Zod and throws on empty provider", () => {
    expect(() =>
      agg.recordCall({
        provider: "",
        model: "claude-sonnet-4",
        latencyMs: 100,
        tokensIn: 0,
        tokensOut: 0,
      }),
    ).toThrow();
  });
});

describe("LLMMetricsAggregator — recordError", () => {
  let agg: LLMMetricsAggregator;

  beforeEach(() => {
    agg = new LLMMetricsAggregator();
  });

  it("counts errors and groups them by code", () => {
    agg.recordError({ provider: "anthropic", errorCode: "RATE_LIMIT_EXCEEDED" });
    agg.recordError({ provider: "anthropic", errorCode: "RATE_LIMIT_EXCEEDED" });
    agg.recordError({ provider: "anthropic", errorCode: "LLM_TIMEOUT" });

    const snap = agg.getMetrics();
    const p = snap.providers[0];
    expect(p.totalErrors).toBe(3);
    expect(p.errorsByCode).toEqual({
      RATE_LIMIT_EXCEEDED: 2,
      LLM_TIMEOUT: 1,
    });
  });

  it("computes error rate against total calls + errors", () => {
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
    });
    agg.recordError({ provider: "anthropic", errorCode: "LLM_TIMEOUT" });

    const snap = agg.getMetrics();
    expect(snap.providers[0].errorRate).toBeCloseTo(0.5, 4);
  });

  it("defaults errorCode to UNKNOWN when omitted", () => {
    agg.recordError({ provider: "openai", errorCode: undefined as unknown as string });
    const snap = agg.getMetrics();
    expect(snap.providers[0].errorsByCode).toEqual({ UNKNOWN: 1 });
  });
});

describe("LLMMetricsAggregator — counters", () => {
  let agg: LLMMetricsAggregator;

  beforeEach(() => {
    agg = new LLMMetricsAggregator();
  });

  it("increments named counters", () => {
    agg.incrementCounter("circuit_breaker_trip");
    agg.incrementCounter("circuit_breaker_trip");
    agg.incrementCounter("rate_limit_hit");
    agg.incrementCounter("tool_loop_detected");

    const snap = agg.getMetrics();
    expect(snap.counters.circuitBreakerTrips).toBe(2);
    expect(snap.counters.rateLimitHits).toBe(1);
    expect(snap.counters.toolLoopsDetected).toBe(1);
  });

  it("rejects unknown counter kinds via Zod", () => {
    expect(() =>
      agg.incrementCounter("not_a_real_counter" as unknown as "circuit_breaker_trip"),
    ).toThrow();
  });
});

describe("LLMMetricsAggregator — reset()", () => {
  it("clears providers and counters and resets uptime", async () => {
    const agg = new LLMMetricsAggregator();
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
    });
    agg.incrementCounter("circuit_breaker_trip");

    expect(agg.getMetrics().providers).toHaveLength(1);
    expect(agg.getMetrics().counters.circuitBreakerTrips).toBe(1);

    agg.reset();

    const snap = agg.getMetrics();
    expect(snap.providers).toHaveLength(0);
    expect(snap.counters.circuitBreakerTrips).toBe(0);
    expect(snap.counters.rateLimitHits).toBe(0);
    expect(snap.counters.toolLoopsDetected).toBe(0);
  });
});

describe("LLMMetricsAggregator — snapshot shape", () => {
  it("returns ISO timestamp and uptime", () => {
    const agg = new LLMMetricsAggregator();
    const snap = agg.getMetrics();
    expect(snap.generatedAt).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(snap.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(snap.providers).toEqual([]);
  });

  it("sorts providers alphabetically", () => {
    const agg = new LLMMetricsAggregator();
    agg.recordCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
    });
    agg.recordCall({
      provider: "anthropic",
      model: "claude-sonnet-4",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
    });
    agg.recordCall({
      provider: "gemini",
      model: "gemini-2.5-pro",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
    });

    const snap = agg.getMetrics();
    expect(snap.providers.map((p) => p.provider)).toEqual([
      "anthropic",
      "gemini",
      "openai",
    ]);
  });

  it("computes avgPerCallUsd correctly", () => {
    const agg = new LLMMetricsAggregator();
    agg.recordCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.10,
    });
    agg.recordCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 100,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.30,
    });

    const snap = agg.getMetrics();
    expect(snap.providers[0].cost.avgPerCallUsd).toBeCloseTo(0.20, 4);
  });
});

describe("module-level helpers", () => {
  beforeEach(() => {
    defaultMetrics.reset();
  });

  it("getMetrics() returns the default singleton snapshot", () => {
    defaultMetrics.recordCall({
      provider: "openai",
      model: "gpt-4o",
      latencyMs: 42,
      tokensIn: 10,
      tokensOut: 5,
    });
    const snap = getMetrics();
    expect(snap.providers).toHaveLength(1);
    expect(snap.providers[0].latency.p50).toBe(42);
  });
});
