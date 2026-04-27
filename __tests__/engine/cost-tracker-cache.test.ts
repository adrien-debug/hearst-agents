import { describe, it, expect, vi } from "vitest";
import { CostTracker } from "@/lib/engine/runtime/engine/cost-tracker";

function fakeDb() {
  const update = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });
  return {
    from: vi.fn().mockReturnValue({ update }),
  };
}

describe("CostTracker — cache token accumulation", () => {
  it("accumulates input/output tokens like before", async () => {
    const db = fakeDb();
    const tracker = new CostTracker(db as never, "run-1");
    await tracker.track({ input_tokens: 100, output_tokens: 20, tool_calls: 0, latency_ms: 0 });
    await tracker.track({ input_tokens: 50, output_tokens: 10, tool_calls: 1, latency_ms: 0 });
    expect(tracker.getCurrent()).toMatchObject({
      llm_input_tokens: 150,
      llm_output_tokens: 30,
      tool_calls: 1,
    });
  });

  it("accumulates cache_creation and cache_read tokens when present", async () => {
    const db = fakeDb();
    const tracker = new CostTracker(db as never, "run-2");
    await tracker.track({
      input_tokens: 10,
      output_tokens: 5,
      tool_calls: 0,
      latency_ms: 0,
      cache_creation_input_tokens: 1500,
      cache_read_input_tokens: 0,
    });
    await tracker.track({
      input_tokens: 8,
      output_tokens: 3,
      tool_calls: 0,
      latency_ms: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 1500,
    });
    const cost = tracker.getCurrent();
    expect(cost.cache_creation_input_tokens).toBe(1500);
    expect(cost.cache_read_input_tokens).toBe(1500);
  });

  it("ignores undefined cache fields without zeroing accumulated counts", async () => {
    const db = fakeDb();
    const tracker = new CostTracker(db as never, "run-3");
    await tracker.track({
      input_tokens: 10,
      output_tokens: 5,
      tool_calls: 0,
      latency_ms: 0,
      cache_creation_input_tokens: 1000,
    });
    await tracker.track({
      input_tokens: 5,
      output_tokens: 1,
      tool_calls: 0,
      latency_ms: 0,
    });
    expect(tracker.getCurrent().cache_creation_input_tokens).toBe(1000);
  });
});
