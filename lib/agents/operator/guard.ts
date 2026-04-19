/**
 * Operator Guard — Runtime validation for tool calls.
 *
 * The Operator can ONLY execute tools explicitly listed in the approved ActionPlan.
 * Any deviation is a violation and is blocked + logged.
 *
 * This is NOT a prompt-level guard — it's a deterministic runtime gate.
 */

import type { ActionStep, ActionPlan } from "../../plans/types";

export interface ToolCallAttempt {
  tool: string;
  params: Record<string, unknown>;
}

export type ValidationResult =
  | { valid: true; action_step: ActionStep }
  | {
      valid: false;
      violation: string;
      violation_type: ViolationType;
    };

export type ViolationType =
  | "tool_not_in_plan"
  | "params_mismatch"
  | "action_not_approved"
  | "action_already_executed"
  | "destructive_retry_blocked";

/**
 * Validate a tool call against the approved ActionPlan.
 * Returns the matching ActionStep if valid, or a violation if not.
 */
export function validateToolCall(
  attempt: ToolCallAttempt,
  actionPlan: ActionPlan,
): ValidationResult {
  // 1. Find matching action by tool name
  const candidates = actionPlan.actions.filter(
    (a) => a.tool === attempt.tool,
  );

  if (candidates.length === 0) {
    return {
      valid: false,
      violation: `Tool "${attempt.tool}" is not in the ActionPlan. Allowed tools: ${listAllowedTools(actionPlan)}`,
      violation_type: "tool_not_in_plan",
    };
  }

  // 2. Find the best match by params
  const match = candidates.find((a) =>
    paramsMatch(attempt.params, a.params),
  );

  if (!match) {
    return {
      valid: false,
      violation: `Tool "${attempt.tool}" found in plan but params don't match any approved action. Approved params: ${JSON.stringify(candidates[0].params)}`,
      violation_type: "params_mismatch",
    };
  }

  // 3. Check approval status
  if (match.requires_approval && match.approval_status !== "approved") {
    return {
      valid: false,
      violation: `Action "${match.description}" requires approval but status is "${match.approval_status}"`,
      violation_type: "action_not_approved",
    };
  }

  // 4. Check execution status (already completed)
  if (match.execution_status === "completed") {
    return {
      valid: false,
      violation: `Action "${match.description}" already executed (idempotency_key: ${match.idempotency_key})`,
      violation_type: "action_already_executed",
    };
  }

  // 5. Block destructive retries
  if (
    match.severity === "destructive" &&
    match.execution_status === "failed"
  ) {
    return {
      valid: false,
      violation: `Destructive action "${match.description}" already failed. Manual retry required.`,
      violation_type: "destructive_retry_blocked",
    };
  }

  return { valid: true, action_step: match };
}

/**
 * Build the set of allowed tools from the ActionPlan.
 * Used by the Operator LLM — only these tools are provided.
 */
export function getAllowedTools(actionPlan: ActionPlan): string[] {
  return [...new Set(actionPlan.actions.map((a) => a.tool))];
}

function listAllowedTools(actionPlan: ActionPlan): string {
  return getAllowedTools(actionPlan).join(", ") || "(none)";
}

/**
 * Strict parameter matching.
 * Every key in the approved params must be present with the same value.
 */
function paramsMatch(
  attempt: Record<string, unknown>,
  approved: Record<string, unknown>,
): boolean {
  for (const [key, value] of Object.entries(approved)) {
    if (attempt[key] === undefined) return false;
    if (JSON.stringify(attempt[key]) !== JSON.stringify(value)) return false;
  }
  return true;
}
