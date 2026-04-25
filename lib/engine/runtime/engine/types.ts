/**
 * Run Engine — Core types.
 *
 * These types define the Run/Step/Approval/Artifact/Cost model.
 */

// ── Run ──────────────────────────────────────────────────

export type EngineRunStatus =
  | "created"
  | "running"
  | "awaiting_clarification"
  | "awaiting_approval"
  | "completed"
  | "failed"
  | "cancelled";

export type EngineEntrypoint = "chat" | "webhook" | "api";

export interface EngineRun {
  id: string;
  user_id: string;
  conversation_id: string | null;
  entrypoint: EngineEntrypoint;
  status: EngineRunStatus;
  intent: string | null;
  request: {
    message: string;
    surface?: string;
    context?: Record<string, unknown>;
  };
  cost: RunCost;
  current_plan_id: string | null;
  current_action_plan_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateRunInput {
  user_id: string;
  conversation_id?: string | null;
  entrypoint: EngineEntrypoint;
  request: {
    message: string;
    surface?: string;
    context?: Record<string, unknown>;
  };
}

// ── RunStep ──────────────────────────────────────────────

export type StepType =
  | "orchestrator"
  | "delegate"
  | "tool_call"
  | "approval"
  | "artifact_build";

export type StepActor =
  | "orchestrator"
  | "Communicator"
  | "KnowledgeRetriever"
  | "Planner"
  | "DocBuilder"
  | "Analyst"
  | "Operator"
  | "runtime"
  | "anthropic_managed";

export type StepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "awaiting_approval"
  | "skipped";

export interface RunStep {
  id: string;
  run_id: string;
  parent_step_id: string | null;
  seq: number;
  type: StepType;
  actor: StepActor;
  title: string;
  status: StepStatus;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: StepError | null;
  retry_count: number;
  started_at: string | null;
  completed_at: string | null;
}

export interface StepError {
  code: string;
  message: string;
  retryable: boolean;
}

export interface CreateStepInput {
  run_id: string;
  parent_step_id?: string | null;
  type: StepType;
  actor: StepActor;
  title: string;
  input?: Record<string, unknown>;
}

// ── RunApproval ──────────────────────────────────────────

export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";

export interface RunApproval {
  id: string;
  run_id: string;
  step_id: string;
  status: ApprovalStatus;
  kind: string;
  summary: string;
  proposed_action: Record<string, unknown>;
  reversible: boolean;
  decided_at: string | null;
  decided_by: string | null;
  expires_at: string;
}

export interface CreateApprovalInput {
  step_id: string;
  kind: string;
  summary: string;
  proposed_action: Record<string, unknown>;
  reversible: boolean;
}

// ── Cost ─────────────────────────────────────────────────

export interface RunCost {
  llm_input_tokens: number;
  llm_output_tokens: number;
  tool_calls: number;
}

export interface UsageMetrics {
  input_tokens: number;
  output_tokens: number;
  tool_calls: number;
  latency_ms: number;
}

// ── Preflight ────────────────────────────────────────────

export type PreflightErrorCode =
  | "TOKEN_MISSING"
  | "TOKEN_EXPIRED"
  | "RATE_LIMITED"
  | "PACK_DISABLED";

export type PreflightResult =
  | { ok: true }
  | {
      ok: false;
      errorCode: PreflightErrorCode;
      message: string;
      retryable: boolean;
      retry_after_ms?: number;
    };
