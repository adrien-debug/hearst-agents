import { describe, it, expect } from "vitest";
import { selectTool } from "@/lib/decisions/tool-selector";
import type { ToolScore } from "@/lib/analytics/tool-ranking";

function makeScore(name: string, overrides: Partial<ToolScore> = {}): ToolScore {
  return {
    tool_name: name,
    score: 0.9,
    rank: 1,
    reliability: "stable",
    flags: [],
    ...overrides,
  };
}

describe("selectTool", () => {
  it("selects highest scoring stable tool", () => {
    const candidates = [
      makeScore("tool:a", { score: 0.8 }),
      makeScore("tool:b", { score: 0.95 }),
      makeScore("tool:c", { score: 0.6 }),
    ];
    const result = selectTool({ candidates });
    expect(result.selected).toBe("tool:b");
    expect(result.fallbacks).toContain("tool:a");
  });

  it("excludes unstable tools", () => {
    const candidates = [
      makeScore("tool:bad", { score: 0.99, reliability: "unstable" }),
      makeScore("tool:ok", { score: 0.7 }),
    ];
    const result = selectTool({ candidates });
    expect(result.selected).toBe("tool:ok");
    expect(result.excluded_unstable).toContain("tool:bad");
  });

  it("returns null when all unstable", () => {
    const candidates = [
      makeScore("tool:bad1", { reliability: "unstable" }),
      makeScore("tool:bad2", { reliability: "unstable" }),
    ];
    const result = selectTool({ candidates });
    expect(result.selected).toBeNull();
  });

  it("filters by category", () => {
    const candidates = [
      makeScore("integration:http.fetch", { score: 0.8 }),
      makeScore("tool:generic", { score: 0.95 }),
    ];
    const result = selectTool({ candidates, category: "integration:" });
    expect(result.selected).toBe("integration:http.fetch");
  });

  it("excludes specified tools", () => {
    const candidates = [
      makeScore("tool:a", { score: 0.95 }),
      makeScore("tool:b", { score: 0.8 }),
    ];
    const result = selectTool({ candidates, exclude: ["tool:a"] });
    expect(result.selected).toBe("tool:b");
  });

  it("prefers reliability when goal=reliability", () => {
    const candidates = [
      makeScore("tool:degraded", { score: 0.95, reliability: "degraded" }),
      makeScore("tool:stable", { score: 0.7, reliability: "stable" }),
    ];
    const result = selectTool({ candidates, goal: "reliability" });
    expect(result.selected).toBe("tool:stable");
  });

  it("avoids high latency when goal=speed", () => {
    const candidates = [
      makeScore("tool:slow", { score: 0.9, flags: ["high_p95_latency"] }),
      makeScore("tool:fast", { score: 0.85 }),
    ];
    const result = selectTool({ candidates, goal: "speed" });
    expect(result.selected).toBe("tool:fast");
  });

  it("avoids high cost when goal=cost", () => {
    const candidates = [
      makeScore("tool:expensive", { score: 0.9, flags: ["high_cost"] }),
      makeScore("tool:cheap", { score: 0.85 }),
    ];
    const result = selectTool({ candidates, goal: "cost" });
    expect(result.selected).toBe("tool:cheap");
  });
});
