/**
 * Plan types — Cognitive plans + executable action plans.
 *
 * Plans are stored in dedicated tables (not as JSON blobs in runs).
 */

// ── Cognitive Plan (Orchestrator's strategy) ─────────────

export type PlanStatus = "active" | "completed" | "abandoned";

export type PlanStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped";

export interface Plan {
  id: string;
  run_id: string;
  reasoning: string;
  status: PlanStatus;
  steps: PlanStep[];
  created_at: string;
}

export interface PlanStep {
  id: string;
  plan_id: string;
  order: number;
  intent: string;
  agent: string;
  task_description: string;
  expected_output: string;
  retrieval_mode?: string;
  depends_on: string[];
  optional: boolean;
  status: PlanStepStatus;
  run_step_id: string | null;
  completed_at: string | null;
}

// ── Action Plan (Executable, approuvable) ────────────────

export type ActionPlanStatus =
  | "proposed"
  | "approved"
  | "partially_approved"
  | "executing"
  | "completed"
  | "failed"
  | "rejected";

export type ActionSeverity = "safe" | "sensitive" | "destructive";

export type ActionStepApproval = "pending" | "approved" | "rejected";
export type ActionStepExecution = "pending" | "running" | "completed" | "failed" | "skipped";

export interface ActionPlan {
  id: string;
  run_id: string;
  plan_id: string | null;
  created_by: string;
  summary: string;
  status: ActionPlanStatus;
  actions: ActionStep[];
  created_at: string;
  decided_at: string | null;
}

export interface ActionStep {
  id: string;
  action_plan_id: string;
  order: number;
  tool: string;
  pack: string;
  params: Record<string, unknown>;
  description: string;
  severity: ActionSeverity;
  reversible: boolean;
  requires_approval: boolean;
  approval_status: ActionStepApproval;
  execution_status: ActionStepExecution;
  idempotency_key: string;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
  executed_at: string | null;
}
