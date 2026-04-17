import { describe, it, expect } from "vitest";
import { RunTracer } from "@/lib/runtime/tracer";
import { RuntimeError } from "@/lib/runtime/lifecycle";
import { createMockSupabase } from "./mock-supabase";

function makeSb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createMockSupabase() as any;
}

describe("RunTracer integration", () => {
  it("creates a run and traces to DB", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    const runId = await tracer.startRun({
      kind: "chat",
      input: { message: "hello" },
    });

    expect(runId).toBeTruthy();
    expect(tracer.getRunId()).toBe(runId);
    expect(tracer.getStatus()).toBe("running");

    const result = await tracer.trace({
      kind: "llm_call",
      name: "test:llm",
      input: { test: true },
      fn: async () => ({
        output: { content: "Hello back!" },
        tokens_in: 10,
        tokens_out: 20,
        cost_usd: 0.001,
        model_used: "test/model",
      }),
    });

    expect(result.status).toBe("completed");
    expect(result.output.content).toBe("Hello back!");
    expect(result.trace_id).toBeTruthy();
    expect(result.validation).toBeDefined();
    expect(result.validation!.trust).toBe("unverified");

    await tracer.endRun("completed", { done: true });
    expect(tracer.getStatus()).toBe("completed");

    const totals = tracer.getTotals();
    expect(totals.tokens_in).toBe(10);
    expect(totals.tokens_out).toBe(20);
    expect(totals.cost_usd).toBe(0.001);
  });

  it("validates LLM output with guard policy", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: { message: "test" },
      guard_policy: { blacklist: ["forbidden"] },
    });

    const result = await tracer.trace({
      kind: "llm_call",
      name: "guarded:llm",
      fn: async () => ({
        output: { content: "This contains forbidden content" },
      }),
    });

    expect(result.validation).toBeDefined();
    expect(result.validation!.trust).toBe("guard_failed");
    expect(result.validation!.classification).not.toBe("valid");
    expect(result.validation!.failed_guards).toContain("blacklist");
  });

  it("does not validate non-LLM traces", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: {},
      guard_policy: { blacklist: ["something"] },
    });

    const result = await tracer.trace({
      kind: "tool_call",
      name: "test:tool",
      fn: async () => ({
        output: { data: "something in the output" },
      }),
    });

    expect(result.validation).toBeUndefined();
  });

  it("enforces cost budget mid-run", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: {},
      cost_budget_usd: 0.005,
    });

    await tracer.trace({
      kind: "llm_call",
      name: "call1",
      fn: async () => ({
        output: { content: "ok" },
        cost_usd: 0.003,
      }),
    });

    await expect(
      tracer.trace({
        kind: "llm_call",
        name: "call2",
        fn: async () => ({
          output: { content: "too expensive" },
          cost_usd: 0.003,
        }),
      }),
    ).rejects.toThrow(RuntimeError);

    try {
      await tracer.trace({
        kind: "llm_call",
        name: "call3",
        fn: async () => ({ output: { content: "never" }, cost_usd: 0.01 }),
      });
    } catch (e) {
      if (e instanceof RuntimeError) {
        expect(e.code).toBe("COST_LIMIT_EXCEEDED");
      }
    }
  });

  it("emits cost:warning event near threshold", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: {},
      cost_budget_usd: 1.0,
    });

    await tracer.trace({
      kind: "llm_call",
      name: "nearbudget",
      fn: async () => ({
        output: { content: "warning territory" },
        cost_usd: 0.85,
      }),
    });

    const events = tracer.getEvents();
    const costWarning = events.find((e) => e.kind === "cost:warning");
    expect(costWarning).toBeDefined();
    expect(costWarning!.data.utilization).toBeGreaterThanOrEqual(0.8);
  });

  it("refuses trace after run is finished", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({ kind: "chat", input: {} });
    await tracer.endRun("completed", {});

    await expect(
      tracer.trace({
        kind: "llm_call",
        name: "late",
        fn: async () => ({ output: {} }),
      }),
    ).rejects.toThrow(RuntimeError);
  });

  it("refuses invalid run transition", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({ kind: "chat", input: {} });
    await tracer.endRun("completed", {});

    await expect(tracer.endRun("failed", {}, "double end")).rejects.toThrow();
  });

  it("handles trace failure gracefully", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({ kind: "chat", input: {} });

    await expect(
      tracer.trace({
        kind: "llm_call",
        name: "failing",
        fn: async () => { throw new Error("provider down"); },
      }),
    ).rejects.toThrow("provider down");

    const events = tracer.getEvents();
    const failEvent = events.find((e) => e.kind === "trace:failed");
    expect(failEvent).toBeDefined();
  });

  it("tracks replay mode", async () => {
    const sb = makeSb();
    const tracer = new RunTracer(sb);

    await tracer.startRun({
      kind: "chat",
      input: {},
      replay_mode: "stub",
    });

    expect(tracer.getReplayMode()).toBe("stub");

    const result = await tracer.trace({
      kind: "llm_call",
      name: "stub:test",
      fn: async () => ({
        output: { content: "stubbed content" },
      }),
    });

    expect(result.validation).toBeDefined();
    expect(result.validation!.trust).toBe("stubbed");
  });
});
