import { describe, it, expect, vi } from "vitest";
import {
  checkCostBudget,
  enforceCostBudget,
  DEFAULT_COST_BUDGET,
} from "@/lib/runtime/cost-sentinel";
import { RuntimeError } from "@/lib/runtime/lifecycle";

describe("checkCostBudget", () => {
  it("returns no issue when budget is null", () => {
    const result = checkCostBudget(10, DEFAULT_COST_BUDGET);
    expect(result.exceeded).toBe(false);
    expect(result.warning).toBe(false);
    expect(result.budget_usd).toBeNull();
    expect(result.utilization).toBeNull();
  });

  it("returns no issue when cost is under threshold", () => {
    const result = checkCostBudget(0.01, { budget_usd: 1.0, warning_threshold: 0.8 });
    expect(result.exceeded).toBe(false);
    expect(result.warning).toBe(false);
    expect(result.utilization).toBe(0.01);
  });

  it("returns warning at 80% utilization", () => {
    const result = checkCostBudget(0.85, { budget_usd: 1.0, warning_threshold: 0.8 });
    expect(result.exceeded).toBe(false);
    expect(result.warning).toBe(true);
    expect(result.utilization).toBe(0.85);
  });

  it("returns exceeded when cost matches budget", () => {
    const result = checkCostBudget(1.0, { budget_usd: 1.0, warning_threshold: 0.8 });
    expect(result.exceeded).toBe(true);
    expect(result.warning).toBe(false);
  });

  it("returns exceeded when cost exceeds budget", () => {
    const result = checkCostBudget(1.5, { budget_usd: 1.0, warning_threshold: 0.8 });
    expect(result.exceeded).toBe(true);
  });

  it("handles zero budget", () => {
    const result = checkCostBudget(0.001, { budget_usd: 0, warning_threshold: 0.8 });
    expect(result.exceeded).toBe(true);
  });
});

describe("enforceCostBudget", () => {
  it("does nothing when no budget set", () => {
    expect(() => enforceCostBudget(100, DEFAULT_COST_BUDGET)).not.toThrow();
  });

  it("does nothing when under budget", () => {
    expect(() =>
      enforceCostBudget(0.01, { budget_usd: 1.0, warning_threshold: 0.8 }),
    ).not.toThrow();
  });

  it("emits warning event at threshold", () => {
    const emitEvent = vi.fn();
    enforceCostBudget(0.85, { budget_usd: 1.0, warning_threshold: 0.8 }, emitEvent);
    expect(emitEvent).toHaveBeenCalledWith("cost:warning", expect.objectContaining({
      current_usd: 0.85,
      budget_usd: 1.0,
    }));
  });

  it("does not emit warning when under threshold", () => {
    const emitEvent = vi.fn();
    enforceCostBudget(0.5, { budget_usd: 1.0, warning_threshold: 0.8 }, emitEvent);
    expect(emitEvent).not.toHaveBeenCalled();
  });

  it("throws COST_LIMIT_EXCEEDED when budget exceeded", () => {
    expect(() =>
      enforceCostBudget(1.5, { budget_usd: 1.0, warning_threshold: 0.8 }),
    ).toThrow(RuntimeError);

    try {
      enforceCostBudget(1.5, { budget_usd: 1.0, warning_threshold: 0.8 });
    } catch (e) {
      expect(e).toBeInstanceOf(RuntimeError);
      expect((e as RuntimeError).code).toBe("COST_LIMIT_EXCEEDED");
    }
  });

  it("throws at exact budget boundary", () => {
    expect(() =>
      enforceCostBudget(1.0, { budget_usd: 1.0, warning_threshold: 0.8 }),
    ).toThrow(RuntimeError);
  });
});
