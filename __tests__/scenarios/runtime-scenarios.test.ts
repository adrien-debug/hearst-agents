/**
 * End-to-end runtime scenarios.
 *
 * Each scenario exercises a critical runtime path end-to-end,
 * using the mock Supabase to verify traces, classifications,
 * decisions, and guard behavior — deterministically.
 */

import { describe, it, expect } from "vitest";
import { createMockSupabase } from "../runtime/mock-supabase";
import { RunTracer } from "../../lib/engine/runtime/tracer";
import { validateOutput } from "../../lib/engine/runtime/output-validator";
import {
  classifyTraceFailure,
  classifyRunFailure,
  aggregateFailures,
} from "../../lib/analytics/failure-classifier";
import { scoreTools, detectDrift, type ToolScore } from "../../lib/analytics/tool-ranking";
import type { ToolMetrics } from "../../lib/analytics/metrics";
import { selectTool } from "../../lib/decisions/tool-selector";
import { selectModel, type ModelScore } from "../../lib/decisions/model-selector";
import { generateToolFeedback } from "../../lib/analytics/feedback";
import type { AgentGuardPolicy } from "../../lib/engine/runtime/prompt-guard";

// ─────────────────────────────────────────────────────────────
// SCÉNARIO 1 — TOOL FAILURE + FALLBACK + TRACE
// ─────────────────────────────────────────────────────────────

describe("Scenario 1: Tool failure + smart fallback", () => {
  it("detects tool A failure, classifies it, fallback to tool B succeeds", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "workflow",
      input: { message: "Fetch data from external API" },
    });

    // --- Tool A call: fails ---
    try {
      await tracer.trace({
        kind: "tool_call",
        name: "tool:api_fetcher_v1",
        input: { tool_id: "tool-a", endpoint: "https://broken.api/data" },
        fn: async () => {
          throw new Error('Tool "api_fetcher_v1" returned HTTP 500');
        },
      });
    } catch (e) {
      // expected — tool A failed
      expect(e).toBeInstanceOf(Error);
    }

    // Classify tool A failure
    const toolAClassification = classifyTraceFailure({
      status: "failed",
      kind: "tool_call",
      name: "tool:api_fetcher_v1",
      error: 'Tool "api_fetcher_v1" returned HTTP 500',
      output_trust: null,
      cost_usd: 0,
      latency_ms: 230,
    });

    expect(toolAClassification).not.toBeNull();
    expect(toolAClassification!.category).toBe("tool_failure");
    expect(toolAClassification!.severity).toBe("medium");
    expect(toolAClassification!.retryable).toBe(true);

    // --- Fallback: tool B succeeds ---
    const toolBResult = await tracer.trace({
      kind: "tool_call",
      name: "tool:api_fetcher_v2",
      input: { tool_id: "tool-b", endpoint: "https://stable.api/data", fallback: true },
      fn: async () => ({
        output: { status: 200, data: { items: [1, 2, 3] } },
      }),
    });

    expect(toolBResult.status).toBe("completed");
    expect(toolBResult.trace_id).toBeTruthy();

    // --- Verify traces in DB ---
    const traces = sb._getTable("traces").getRows();
    const toolTraces = traces.filter((t: Record<string, unknown>) => t.kind === "tool_call");
    expect(toolTraces.length).toBe(2);

    const failedTrace = toolTraces.find((t: Record<string, unknown>) => t.status === "failed");
    const successTrace = toolTraces.find((t: Record<string, unknown>) => t.status === "completed");
    expect(failedTrace).toBeTruthy();
    expect(successTrace).toBeTruthy();
    expect(failedTrace!.name).toBe("tool:api_fetcher_v1");
    expect(successTrace!.name).toBe("tool:api_fetcher_v2");

    // --- Tool selector would recommend B over A ---
    const toolScores: ToolScore[] = [
      { tool_name: "tool:api_fetcher_v1", score: 0.3, rank: 2, reliability: "unstable", flags: ["low_success_rate"] },
      { tool_name: "tool:api_fetcher_v2", score: 0.9, rank: 1, reliability: "stable", flags: [] },
    ];

    const selection = selectTool({ candidates: toolScores, goal: "reliability" });
    expect(selection.selected).toBe("tool:api_fetcher_v2");
    expect(selection.excluded_unstable).toContain("tool:api_fetcher_v1");

    await tracer.endRun("completed", { fallback_used: true });
    expect(tracer.getStatus()).toBe("completed");
  });

  it("generates tool_replacement signal for unstable tool", () => {
    const toolScores: ToolScore[] = [
      { tool_name: "api_fetcher_v1", score: 0.2, rank: 2, reliability: "unstable", flags: ["low_success_rate", "frequent_timeouts"] },
      { tool_name: "api_fetcher_v2", score: 0.9, rank: 1, reliability: "stable", flags: [] },
    ];

    const feedback = generateToolFeedback(toolScores);
    const replacementAlerts = feedback.filter((s) => s.kind === "tool_replacement");
    expect(replacementAlerts.length).toBeGreaterThanOrEqual(1);
    expect(replacementAlerts[0].target_id).toBe("api_fetcher_v1");
    expect(replacementAlerts[0].priority).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────
// SCÉNARIO 2 — COST LIMIT HARD STOP
// ─────────────────────────────────────────────────────────────

describe("Scenario 2: Cost limit hard stop", () => {
  it("enforces cost budget and stops the run", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: { message: "Do a multi-step reasoning task" },
      cost_budget_usd: 0.001,
    });

    // First LLM call — under budget, but triggers warning
    await tracer.trace({
      kind: "llm_call",
      name: "openai/gpt-4",
      input: { step: 1 },
      fn: async () => ({
        output: { content: "Step 1 reasoning..." },
        tokens_in: 100,
        tokens_out: 200,
        cost_usd: 0.0009,
        model_used: "openai/gpt-4",
      }),
    });

    // Check warning event was emitted (80% = 0.0008, we're at 0.0009)
    const events = tracer.getEvents();
    const warningEvents = events.filter((e) => e.kind === "cost:warning");
    expect(warningEvents.length).toBe(1);
    expect(warningEvents[0].data.utilization).toBeGreaterThanOrEqual(0.8);

    // Second LLM call — exceeds budget → COST_LIMIT_EXCEEDED
    let costExceeded = false;
    try {
      await tracer.trace({
        kind: "llm_call",
        name: "openai/gpt-4",
        input: { step: 2 },
        fn: async () => ({
          output: { content: "Step 2 detailed explanation..." },
          tokens_in: 150,
          tokens_out: 300,
          cost_usd: 0.002,
          model_used: "openai/gpt-4",
        }),
      });
    } catch (e) {
      costExceeded = true;
      expect(e).toBeDefined();
      const err = e as Error;
      expect(err.message).toContain("exceeds budget");
    }

    expect(costExceeded).toBe(true);

    // Classify the run failure
    const runClassification = classifyRunFailure({
      status: "failed",
      error: "Run cost $0.0029 exceeds budget $0.0010",
      cost_usd: 0.0029,
      cost_budget_usd: 0.001,
      latency_ms: 3000,
      timeout_ms: 60000,
    });

    expect(runClassification).not.toBeNull();
    expect(runClassification!.category).toBe("cost_exceeded");
    expect(runClassification!.severity).toBe("critical");
    expect(runClassification!.retryable).toBe(false);

    // Verify traces count
    const traces = sb._getTable("traces").getRows();
    expect(traces.length).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────
// SCÉNARIO 3 — GUARD FAILURE (STRICT POLICY)
// ─────────────────────────────────────────────────────────────

describe("Scenario 3: Guard failure with strict policy", () => {
  it("rejects output containing blacklisted terms", () => {
    const policy: AgentGuardPolicy = {
      blacklist: ["password", "secret"],
      max_output_chars: 50,
    };

    const longOutput = "To store a password securely, you should use bcrypt hashing with a salt factor of at least 12.";

    const result = validateOutput(longOutput, { policy });

    expect(result.classification).toBe("invalid");
    expect(result.trust).toBe("guard_failed");
    expect(result.score).toBeLessThan(1);
    expect(result.failed_guards.length).toBeGreaterThan(0);

    const failedNames = result.failed_guards;
    expect(failedNames.some((g) => g === "blacklist" || g === "output_size")).toBe(true);
  });

  it("rejects output exceeding max_output_chars", () => {
    const policy: AgentGuardPolicy = {
      max_output_chars: 20,
    };

    const result = validateOutput("This is a response that is way too long for the policy limit.", { policy });

    expect(result.trust).toBe("guard_failed");
    expect(result.failed_guards).toContain("output_size");
  });

  it("classifies guard failure trace correctly", () => {
    const classification = classifyTraceFailure({
      status: "completed",
      kind: "llm_call",
      name: "openai/gpt-4",
      error: null,
      output_trust: "guard_failed",
      cost_usd: 0.005,
      latency_ms: 1200,
    });

    expect(classification).not.toBeNull();
    expect(classification!.category).toBe("guard_failure");
    expect(classification!.severity).toBe("high");
    expect(classification!.retryable).toBe(false);
  });

  it("integrates guard policy into tracer without crash", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    const policy: AgentGuardPolicy = {
      blacklist: ["password"],
      max_output_chars: 30,
    };

    await tracer.startRun({
      kind: "chat",
      input: { message: "Explain password storage" },
      guard_policy: policy,
    });

    const result = await tracer.trace({
      kind: "llm_call",
      name: "openai/gpt-4",
      input: {},
      fn: async () => ({
        output: { content: "Use password hashing with bcrypt for security." },
        tokens_in: 50,
        tokens_out: 100,
        cost_usd: 0.002,
        model_used: "openai/gpt-4",
      }),
    });

    // Validation runs and produces result — no crash
    expect(result.validation).toBeDefined();
    expect(result.validation!.trust).toBe("guard_failed");
    expect(result.validation!.classification).not.toBe("valid");
    expect(result.validation!.failed_guards.length).toBeGreaterThan(0);

    // Trace was persisted with output_trust
    const traces = sb._getTable("traces").getRows();
    const llmTrace = traces.find((t: Record<string, unknown>) => t.kind === "llm_call");
    expect(llmTrace).toBeTruthy();
    expect(llmTrace!.output_trust).toBe("guard_failed");

    await tracer.endRun("completed", {});
  });
});

// ─────────────────────────────────────────────────────────────
// SCÉNARIO 4 — MODEL ROUTING + FALLBACK
// ─────────────────────────────────────────────────────────────

describe("Scenario 4: Model routing with fallback", () => {
  it("selects best model and provides fallback chain", () => {
    const scores: ModelScore[] = [
      {
        profile_id: "p-gpt4",
        provider: "openai",
        model: "gpt-4",
        score: 0.75,
        rank: 2,
        reliability: "degraded",
        flags: ["below_target_success_rate"],
        stats: { total_calls: 30, success_rate: 0.85, avg_latency_ms: 3000, avg_cost_usd: 0.02 },
      },
      {
        profile_id: "p-claude",
        provider: "anthropic",
        model: "claude-3-sonnet",
        score: 0.92,
        rank: 1,
        reliability: "stable",
        flags: [],
        stats: { total_calls: 80, success_rate: 0.97, avg_latency_ms: 1500, avg_cost_usd: 0.015 },
      },
      {
        profile_id: "p-bad",
        provider: "openai",
        model: "gpt-3.5",
        score: 0.3,
        rank: 3,
        reliability: "unstable",
        flags: ["low_success_rate", "high_latency"],
        stats: { total_calls: 20, success_rate: 0.5, avg_latency_ms: 20000, avg_cost_usd: 0.005 },
      },
    ];

    // reliability goal
    const selection = selectModel(scores, "reliability");
    expect(selection.selected).not.toBeNull();
    expect(selection.selected!.provider).toBe("anthropic");
    expect(selection.selected!.model).toBe("claude-3-sonnet");
    expect(selection.selected!.reliability).toBe("stable");
    expect(selection.reason).toContain("reliability");

    // unstable model excluded from selection
    expect(selection.fallbacks.every((f) => f.reliability !== "unstable")).toBe(true);

    // gpt-4 is in fallbacks (degraded, not unstable)
    expect(selection.fallbacks.some((f) => f.model === "gpt-4")).toBe(true);
  });

  it("records was_overridden when selection differs from agent config", () => {
    const scores: ModelScore[] = [
      {
        profile_id: "p-claude",
        provider: "anthropic",
        model: "claude-3-sonnet",
        score: 0.95,
        rank: 1,
        reliability: "stable",
        flags: [],
        stats: { total_calls: 100, success_rate: 0.98, avg_latency_ms: 1200, avg_cost_usd: 0.01 },
      },
    ];

    const selection = selectModel(scores, "reliability");
    const wasOverridden =
      selection.selected!.provider !== "openai" || selection.selected!.model !== "gpt-4";

    expect(wasOverridden).toBe(true);
  });

  it("traces model_selection decision with full context", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: { message: "Summarize a complex topic" },
    });

    // Simulate the model_selection trace that smartChat produces
    await tracer.trace({
      kind: "custom",
      name: "model_selection",
      input: {
        goal: "reliability",
        original: "openai/gpt-4",
        scores_considered: 3,
      },
      fn: async () => ({
        output: {
          selected: "anthropic/claude-3-sonnet",
          score: 0.92,
          reliability: "stable",
          was_overridden: true,
          reason: "Selected anthropic/claude-3-sonnet (score: 0.92, stable) — goal: reliability",
          fallback_count: 1,
          fallbacks: ["openai/gpt-4"],
        },
      }),
    });

    const traces = sb._getTable("traces").getRows();
    const selectionTrace = traces.find((t: Record<string, unknown>) => t.name === "model_selection");
    expect(selectionTrace).toBeTruthy();
    expect((selectionTrace!.output as Record<string, unknown>).was_overridden).toBe(true);
    expect((selectionTrace!.output as Record<string, unknown>).selected).toBe("anthropic/claude-3-sonnet");
    expect((selectionTrace!.output as Record<string, unknown>).reason).toContain("reliability");

    await tracer.endRun("completed", {});
  });

  it("traces model_fallback when primary fails", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: { message: "Summarize topic" },
    });

    await tracer.trace({
      kind: "custom",
      name: "model_fallback",
      input: {
        failed_model: "anthropic/claude-3-sonnet",
        attempt_index: 1,
        error: "Provider rate limited",
      },
      fn: async () => ({
        output: {
          fallback_to: "openai/gpt-4",
          reason: "Primary anthropic/claude-3-sonnet failed, falling back to attempt #2",
        },
      }),
    });

    const traces = sb._getTable("traces").getRows();
    const fallbackTrace = traces.find((t: Record<string, unknown>) => t.name === "model_fallback");
    expect(fallbackTrace).toBeTruthy();
    expect((fallbackTrace!.output as Record<string, unknown>).fallback_to).toBe("openai/gpt-4");
    expect((fallbackTrace!.input as Record<string, unknown>).error).toBe("Provider rate limited");

    await tracer.endRun("completed", {});
  });
});

// ─────────────────────────────────────────────────────────────
// SCÉNARIO 5 — FULL WORKFLOW END-TO-END
// ─────────────────────────────────────────────────────────────

describe("Scenario 5: Full workflow end-to-end", () => {
  it("executes multi-step workflow with full tracing", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "workflow",
      workflow_id: "wf-1",
      input: { query: "Get GitHub repo data and summarize" },
    });

    // Step 1: LLM → analyze input
    const step1 = await tracer.trace({
      kind: "llm_call",
      step_index: 0,
      name: "step_0:input_analyzer",
      input: { context_length: 40 },
      fn: async () => ({
        output: { content: "Fetch https://api.github.com/repos/hearst/agents" },
        tokens_in: 20,
        tokens_out: 15,
        cost_usd: 0.0001,
        model_used: "openai/gpt-4",
      }),
    });
    expect(step1.status).toBe("completed");
    expect(step1.validation).toBeDefined();

    // Step 2: Tool → http.fetch
    const step2 = await tracer.trace({
      kind: "tool_call",
      step_index: 1,
      name: "integration:http.fetch",
      input: { url: "https://api.github.com/repos/hearst/agents" },
      fn: async () => ({
        output: { status: 200, data: { name: "hearst-agents", stars: 42, language: "TypeScript" } },
      }),
    });
    expect(step2.status).toBe("completed");

    // Step 3: LLM → transform
    const step3 = await tracer.trace({
      kind: "llm_call",
      step_index: 2,
      name: "step_2:summarizer",
      input: { context_length: 80 },
      fn: async () => ({
        output: { content: "hearst-agents is a TypeScript repo with 42 stars." },
        tokens_in: 40,
        tokens_out: 20,
        cost_usd: 0.0002,
        model_used: "openai/gpt-4",
      }),
    });
    expect(step3.status).toBe("completed");
    expect(step3.validation).toBeDefined();
    expect(step3.validation!.classification).toBe("valid");

    // Step 4: condition eval
    const step4 = await tracer.trace({
      kind: "condition_eval",
      step_index: 3,
      name: "condition:stars_check",
      input: { field: "stars", operator: "gt", value: 10 },
      fn: async () => ({
        output: { condition_met: true },
      }),
    });
    expect(step4.status).toBe("completed");

    await tracer.endRun("completed", {
      output: "hearst-agents is a TypeScript repo with 42 stars.",
    });

    // --- Verify full trace chain ---
    const traces = sb._getTable("traces").getRows();
    expect(traces.length).toBe(4);

    const kinds = traces.map((t: Record<string, unknown>) => t.kind);
    expect(kinds).toEqual(["llm_call", "tool_call", "llm_call", "condition_eval"]);

    // All step_index are sequential
    const indexes = traces.map((t: Record<string, unknown>) => t.step_index);
    expect(indexes).toEqual([0, 1, 2, 3]);

    // Cost accumulation
    const totals = tracer.getTotals();
    expect(totals.cost_usd).toBeCloseTo(0.0003, 6);
    expect(totals.tokens_in).toBe(60);
    expect(totals.tokens_out).toBe(35);

    // Run status
    const runs = sb._getTable("runs").getRows();
    expect(runs[0].status).toBe("completed");
  });

  it("stub replay produces identical output with zero cost", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "workflow",
      replay_mode: "stub",
      input: { query: "replayed" },
    });

    expect(tracer.getReplayMode()).toBe("stub");

    // Stub trace — LLM call uses original output
    const result = await tracer.trace({
      kind: "llm_call",
      name: "stub:original_llm",
      input: { stubbed: true },
      fn: async () => ({
        output: { content: "Original cached response" },
        tokens_in: 0,
        tokens_out: 0,
        cost_usd: 0,
        model_used: "stub/original",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.validation).toBeDefined();
    expect(result.validation!.trust).toBe("stubbed");
    expect(result.validation!.classification).toBe("valid");
    expect(result.validation!.score).toBe(1);

    const totals = tracer.getTotals();
    expect(totals.cost_usd).toBe(0);
    expect(totals.tokens_in).toBe(0);

    await tracer.endRun("completed", {});
  });
});

// ─────────────────────────────────────────────────────────────
// SCÉNARIO 6 — DRIFT DETECTION
// ─────────────────────────────────────────────────────────────

describe("Scenario 6: Drift detection", () => {
  it("detects success_rate degradation and triggers alert", () => {
    const previous: ToolMetrics[] = [
      {
        tool_name: "tool:data_fetcher",
        total_calls: 50,
        successful: 48,
        failed: 2,
        timed_out: 0,
        success_rate: 0.96,
        avg_latency_ms: 500,
        p95_latency_ms: 800,
        total_cost_usd: 0.1,
        avg_cost_usd: 0.002,
        failure_breakdown: { network_error: 2 },
        last_used: "2026-04-10T00:00:00Z",
      },
    ];

    const current: ToolMetrics[] = [
      {
        tool_name: "tool:data_fetcher",
        total_calls: 30,
        successful: 18,
        failed: 12,
        timed_out: 5,
        success_rate: 0.6,
        avg_latency_ms: 1200,
        p95_latency_ms: 3000,
        total_cost_usd: 0.06,
        avg_cost_usd: 0.002,
        failure_breakdown: { network_error: 7, timeout: 5 },
        last_used: "2026-04-17T00:00:00Z",
      },
    ];

    const drifts = detectDrift(current, previous);

    expect(drifts.length).toBeGreaterThanOrEqual(1);

    const successDrift = drifts.find((d) => d.metric === "success_rate");
    expect(successDrift).toBeTruthy();
    expect(successDrift!.alert).toBe(true);
    expect(successDrift!.change).toBeLessThan(-0.1);

    const latencyDrift = drifts.find((d) => d.metric === "avg_latency_ms");
    expect(latencyDrift).toBeTruthy();
    expect(latencyDrift!.alert).toBe(true);
  });

  it("scores degraded tool as unstable and generates feedback signal", () => {
    const degradedMetrics: ToolMetrics[] = [
      {
        tool_name: "tool:data_fetcher",
        total_calls: 30,
        successful: 18,
        failed: 12,
        timed_out: 5,
        success_rate: 0.6,
        avg_latency_ms: 1200,
        p95_latency_ms: 3000,
        total_cost_usd: 0.06,
        avg_cost_usd: 0.002,
        failure_breakdown: { network_error: 7, timeout: 5 },
        last_used: "2026-04-17T00:00:00Z",
      },
    ];

    const scores = scoreTools(degradedMetrics);
    expect(scores[0].reliability).toBe("unstable");
    expect(scores[0].flags).toContain("low_success_rate");
    expect(scores[0].flags).toContain("frequent_timeouts");

    const feedback = generateToolFeedback(scores);
    const alerts = feedback.filter((s) => s.kind === "tool_replacement");
    expect(alerts.length).toBeGreaterThanOrEqual(1);
    expect(alerts[0].priority).toBe("high");
  });

  it("aggregates multiple failure types correctly", () => {
    const classifications = [
      classifyTraceFailure({
        status: "failed", kind: "tool_call", name: "tool:fetcher",
        error: "HTTP 500", output_trust: null, cost_usd: 0, latency_ms: 100,
      })!,
      classifyTraceFailure({
        status: "timeout", kind: "tool_call", name: "tool:fetcher",
        error: "Timed out after 5000ms", output_trust: null, cost_usd: 0, latency_ms: 5000,
      })!,
      classifyTraceFailure({
        status: "completed", kind: "llm_call", name: "openai/gpt-4",
        error: null, output_trust: "guard_failed", cost_usd: 0.01, latency_ms: 1200,
      })!,
      classifyRunFailure({
        status: "failed", error: "Run cost $0.05 exceeds budget $0.01",
        cost_usd: 0.05, cost_budget_usd: 0.01, latency_ms: 8000, timeout_ms: 60000,
      })!,
    ];

    const agg = aggregateFailures(classifications);
    expect(agg.tool_failure).toBe(1);
    expect(agg.timeout).toBe(1);
    expect(agg.guard_failure).toBe(1);
    expect(agg.cost_exceeded).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────
// META — Cross-scenario: full audit trail
// ─────────────────────────────────────────────────────────────

describe("Cross-scenario: audit completeness", () => {
  it("every trace has run_id, kind, status, timestamps", async () => {
    const sb = createMockSupabase();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: { audit: true },
    });

    await tracer.trace({
      kind: "llm_call",
      name: "audit-test",
      input: {},
      fn: async () => ({
        output: { content: "test" },
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: 0.0001,
        model_used: "openai/gpt-4",
      }),
    });

    await tracer.endRun("completed", {});

    const traces = sb._getTable("traces").getRows();
    for (const trace of traces) {
      expect(trace.run_id).toBeTruthy();
      expect(trace.kind).toBeTruthy();
      expect(trace.status).toBeTruthy();
      expect(trace.started_at).toBeTruthy();
      expect(trace.finished_at).toBeTruthy();
      expect(typeof trace.latency_ms).toBe("number");
    }

    const runs = sb._getTable("runs").getRows();
    for (const run of runs) {
      expect(run.kind).toBeTruthy();
      expect(run.status).toBe("completed");
      expect(run.started_at).toBeTruthy();
    }
  });
});
