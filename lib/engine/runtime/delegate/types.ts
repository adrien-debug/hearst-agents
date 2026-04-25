/**
 * Delegate types — Contract between Orchestrator and Capability Agents.
 */

export type CapabilityAgent =
  | "Communicator"
  | "KnowledgeRetriever"
  | "Planner"
  | "DocBuilder"
  | "Analyst"
  | "Operator"
  | "FinanceAgent";

export type ExpectedOutput =
  | "summary"
  | "draft"
  | "report"
  | "data"
  | "plan"
  | "execution_result";

export interface DelegateInput {
  run_id: string;
  parent_step_id?: string;
  agent: CapabilityAgent;
  task: string;
  context: Record<string, unknown>;
  expected_output: ExpectedOutput;
  artifacts_in?: string[];
  timeout_ms?: number;
  priority?: "low" | "normal" | "high";
  retrieval_mode?: string;
}

// ── Result types ─────────────────────────────────────────

export interface DelegateSuccess {
  status: "success";
  step_id: string;
  data: Record<string, unknown>;
  artifacts?: Array<{
    artifact_id: string;
    type: string;
    title?: string;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    tool_calls?: number;
    latency_ms?: number;
  };
}

export interface DelegateEnqueued {
  status: "enqueued";
  step_id: string;
  job_id: string;
  estimated_completion_ms?: number;
}

export interface DelegateNeedsApproval {
  status: "needs_approval";
  step_id: string;
  approval_request: {
    kind: string;
    summary: string;
    proposed_action: Record<string, unknown>;
  };
  partial_data?: Record<string, unknown>;
}

export interface DelegateNeedsClarification {
  status: "needs_clarification";
  step_id: string;
  question: string;
  options?: string[];
}

export interface DelegateError {
  status: "error";
  step_id: string;
  error: {
    code:
      | "TIMEOUT"
      | "TOOL_UNAVAILABLE"
      | "PERMISSION_DENIED"
      | "TOKEN_MISSING"
      | "TOKEN_EXPIRED"
      | "INVALID_INPUT"
      | "AGENT_FAILED"
      | "AGENT_FATAL"
      | "STRIPE_ERROR"
      | "RATE_LIMITED";
    message: string;
    retryable: boolean;
  };
}

export type DelegateResult =
  | DelegateSuccess
  | DelegateEnqueued
  | DelegateNeedsApproval
  | DelegateNeedsClarification
  | DelegateError;
