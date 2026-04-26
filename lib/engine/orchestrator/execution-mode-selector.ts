/**
 * Execution Mode Selector — pure function, no side effects.
 *
 * Maps an ExecutionContext to the appropriate ExecutionMode.
 * Deterministic: same input always produces the same decision.
 */

import {
  ExecutionMode,
  type ExecutionContext,
  type ExecutionDecision,
} from "./types/execution-mode";

export function selectExecutionMode(
  ctx: ExecutionContext,
): ExecutionDecision {
  if (ctx.complexity <= 2 && ctx.providersNeeded === 0) {
    return {
      mode: ExecutionMode.DIRECT_ANSWER,
      reason: "Simple response — no providers needed",
    };
  }

  if (ctx.complexity <= 3 && ctx.providersNeeded <= 1 && !ctx.needsAutonomy) {
    return {
      mode: ExecutionMode.TOOL_CALL,
      reason: "Single tool call",
      backend: "hearst_runtime",
    };
  }

  if (ctx.complexity <= 6 && ctx.providersNeeded <= 3 && !ctx.needsAutonomy) {
    return {
      mode: ExecutionMode.WORKFLOW,
      reason: "Multi-step workflow",
      backend: "hearst_runtime",
    };
  }

  if (ctx.needsAutonomy || ctx.needsMemory) {
    return {
      mode: ExecutionMode.CUSTOM_AGENT,
      reason: "Requires autonomous agent",
      backend: "hearst_runtime",
    };
  }

  return {
    mode: ExecutionMode.MANAGED_AGENT,
    reason: "Fallback to managed agent",
    backend: "anthropic_managed",
  };
}
