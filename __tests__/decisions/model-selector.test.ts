import { describe, it, expect } from "vitest";
import { selectModel, type ModelScore } from "../../lib/decisions/model-selector";

function score(overrides: Partial<ModelScore> = {}): ModelScore {
  return {
    profile_id: "p-1",
    provider: "openai",
    model: "gpt-4",
    score: 0.8,
    rank: 1,
    reliability: "stable",
    flags: [],
    stats: { total_calls: 50, success_rate: 0.95, avg_latency_ms: 1200, avg_cost_usd: 0.01 },
    ...overrides,
  };
}

describe("selectModel", () => {
  it("selects highest-scored stable model", () => {
    const models = [
      score({ profile_id: "p-1", score: 0.8 }),
      score({ profile_id: "p-2", score: 0.9, model: "gpt-4o" }),
    ];
    const result = selectModel(models, "balanced");
    expect(result.selected?.profile_id).toBe("p-2");
    expect(result.fallbacks).toHaveLength(1);
  });

  it("excludes unstable models from selection", () => {
    const models = [
      score({ profile_id: "p-1", score: 0.95, reliability: "unstable" }),
      score({ profile_id: "p-2", score: 0.6, reliability: "stable" }),
    ];
    const result = selectModel(models, "balanced");
    expect(result.selected?.profile_id).toBe("p-2");
  });

  it("returns null when all unstable", () => {
    const models = [
      score({ reliability: "unstable" }),
    ];
    const result = selectModel(models);
    expect(result.selected).toBeNull();
    expect(result.reason).toContain("unstable");
  });

  it("returns null on empty list", () => {
    const result = selectModel([]);
    expect(result.selected).toBeNull();
    expect(result.reason).toContain("No model");
  });

  it("reliability goal prefers stable over degraded", () => {
    const models = [
      score({ profile_id: "p-1", score: 0.9, reliability: "degraded" }),
      score({ profile_id: "p-2", score: 0.7, reliability: "stable" }),
    ];
    const result = selectModel(models, "reliability");
    expect(result.selected?.profile_id).toBe("p-2");
  });

  it("speed goal deprioritizes high_latency", () => {
    const models = [
      score({ profile_id: "p-1", score: 0.9, flags: ["high_latency"] }),
      score({ profile_id: "p-2", score: 0.7, flags: [] }),
    ];
    const result = selectModel(models, "speed");
    expect(result.selected?.profile_id).toBe("p-2");
  });

  it("cost goal deprioritizes high_cost", () => {
    const models = [
      score({ profile_id: "p-1", score: 0.9, flags: ["high_cost"] }),
      score({ profile_id: "p-2", score: 0.7, flags: [] }),
    ];
    const result = selectModel(models, "cost");
    expect(result.selected?.profile_id).toBe("p-2");
  });

  it("provides up to 3 fallbacks", () => {
    const models = Array.from({ length: 6 }, (_, i) =>
      score({ profile_id: `p-${i}`, score: 1 - i * 0.1 }),
    );
    const result = selectModel(models, "balanced");
    expect(result.fallbacks).toHaveLength(3);
  });
});
