/**
 * Cost Sentinel — runtime cost enforcement.
 *
 * Checks accumulated cost against budget after every trace.
 * Throws COST_LIMIT_EXCEEDED to halt the run if budget is blown.
 */

import { RuntimeError, type RunEventKind } from "./lifecycle";

export interface CostBudget {
  budget_usd: number | null;
  warning_threshold: number;
}

export const DEFAULT_COST_BUDGET: CostBudget = {
  budget_usd: null,
  warning_threshold: 0.8,
};

export interface CostCheckResult {
  exceeded: boolean;
  warning: boolean;
  current_usd: number;
  budget_usd: number | null;
  utilization: number | null;
}

export function checkCostBudget(
  currentCost: number,
  budget: CostBudget,
): CostCheckResult {
  if (budget.budget_usd === null) {
    return { exceeded: false, warning: false, current_usd: currentCost, budget_usd: null, utilization: null };
  }

  const utilization = currentCost / budget.budget_usd;
  const exceeded = currentCost >= budget.budget_usd;
  const warning = !exceeded && utilization >= budget.warning_threshold;

  return {
    exceeded,
    warning,
    current_usd: currentCost,
    budget_usd: budget.budget_usd,
    utilization: Math.round(utilization * 1000) / 1000,
  };
}

export function enforceCostBudget(
  currentCost: number,
  budget: CostBudget,
  emitEvent?: (kind: RunEventKind, data: Record<string, unknown>) => void,
): void {
  const result = checkCostBudget(currentCost, budget);

  if (result.warning && emitEvent) {
    emitEvent("cost:warning", {
      current_usd: result.current_usd,
      budget_usd: result.budget_usd,
      utilization: result.utilization,
    });
  }

  if (result.exceeded) {
    throw new RuntimeError(
      "COST_LIMIT_EXCEEDED",
      `Run cost $${currentCost.toFixed(4)} exceeds budget $${budget.budget_usd!.toFixed(4)}`,
    );
  }
}
