/**
 * Operator Agent — Executes approved ActionPlans.
 *
 * The Operator is NOT a conversational agent.
 * It does NOT use an LLM to decide what to do.
 * It executes a list of pre-approved actions deterministically.
 *
 * Security model:
 * - Tool calls are validated against the ActionPlan at runtime (guard.ts)
 * - Idempotency is enforced via action_executions table
 * - Destructive actions cannot be auto-retried
 * - Every execution is logged as an event
 */

export { validateToolCall, getAllowedTools } from "./guard";
export type { ToolCallAttempt, ValidationResult, ViolationType } from "./guard";

export { executeActionPlan } from "./executor";
export type {
  OperatorResult,
  ActionStepResult,
  ToolExecutor,
} from "./executor";
