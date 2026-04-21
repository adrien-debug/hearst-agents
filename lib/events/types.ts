/**
 * Run Event Bus — Event types.
 *
 * Internal events emitted by the Run Engine and its sub-managers.
 * Consumers (SSEAdapter, LogPersister, analytics) subscribe to these.
 */

import type {
  StepActor,
  RunCost,
} from "../runtime/engine/types";
import type { ArtifactType } from "../artifacts/types";
import type { AssetType } from "../runtime/assets/types";
import type { ToolCapability } from "../tools/types";

// ── Event union ──────────────────────────────────────────

export type RunEvent =
  // Run lifecycle
  | RunCreatedEvent
  | RunStartedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunCancelledEvent
  | RunSuspendedEvent
  | RunResumedEvent
  // Plan
  | PlanAttachedEvent
  // Steps
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | StepRetryingEvent
  // Delegate
  | DelegateEnqueuedEvent
  | DelegateCompletedEvent
  // Tool calls
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  // Approvals
  | ApprovalRequestedEvent
  | ApprovalDecidedEvent
  | ActionPlanProposedEvent
  // Artifacts
  | ArtifactCreatedEvent
  | ArtifactRevisedEvent
  // Text streaming
  | TextDeltaEvent
  // Clarification
  | ClarificationRequestedEvent
  // Cost
  | CostUpdatedEvent
  // Retrieval
  | RetrievalModeInferredEvent
  // Scheduled missions
  | ScheduledMissionCreatedEvent
  | ScheduledMissionTriggeredEvent
  // Assets
  | AssetGeneratedEvent
  // Agent selection
  | AgentSelectedEvent
  // Tool surface
  | ToolSurfaceEvent
  // Execution mode
  | ExecutionModeSelectedEvent
  // Orchestrator log
  | OrchestratorLogEvent
  // Capability blocked
  | CapabilityBlockedEvent
  // Warnings & violations
  | RuntimeWarningEvent
  | OperatorViolationEvent;

// ── Base ─────────────────────────────────────────────────

interface BaseEvent {
  run_id: string;
  timestamp: string;
}

// ── Run lifecycle ────────────────────────────────────────

export interface RunCreatedEvent extends BaseEvent {
  type: "run_created";
}
export interface RunStartedEvent extends BaseEvent {
  type: "run_started";
}
export interface RunCompletedEvent extends BaseEvent {
  type: "run_completed";
  artifacts: Array<{ artifact_id: string; type: ArtifactType; title: string }>;
}
export interface RunFailedEvent extends BaseEvent {
  type: "run_failed";
  error: string;
}
export interface RunCancelledEvent extends BaseEvent {
  type: "run_cancelled";
}
export interface RunSuspendedEvent extends BaseEvent {
  type: "run_suspended";
  reason: "awaiting_approval" | "awaiting_clarification";
}
export interface RunResumedEvent extends BaseEvent {
  type: "run_resumed";
}

// ── Plan ─────────────────────────────────────────────────

export interface PlanAttachedEvent extends BaseEvent {
  type: "plan_attached";
  plan_id: string;
  step_count: number;
}

// ── Steps ────────────────────────────────────────────────

export interface StepStartedEvent extends BaseEvent {
  type: "step_started";
  step_id: string;
  agent: StepActor;
  title: string;
}
export interface StepCompletedEvent extends BaseEvent {
  type: "step_completed";
  step_id: string;
  agent: StepActor;
}
export interface StepFailedEvent extends BaseEvent {
  type: "step_failed";
  step_id: string;
  error: string;
}
export interface StepRetryingEvent extends BaseEvent {
  type: "step_retrying";
  step_id: string;
  attempt: number;
}

// ── Delegate ─────────────────────────────────────────────

export interface DelegateEnqueuedEvent extends BaseEvent {
  type: "delegate_enqueued";
  step_id: string;
  agent: StepActor;
  job_id: string;
}
export interface DelegateCompletedEvent extends BaseEvent {
  type: "delegate_completed";
  step_id: string;
  status: string;
}

// ── Tool calls ───────────────────────────────────────────

export interface ToolCallStartedEvent extends BaseEvent {
  type: "tool_call_started";
  step_id: string;
  tool: string;
  providerId?: string;
  providerLabel?: string;
}
export interface ToolCallCompletedEvent extends BaseEvent {
  type: "tool_call_completed";
  step_id: string;
  tool: string;
  providerId?: string;
}

// ── Approvals ────────────────────────────────────────────

export interface ApprovalRequestedEvent extends BaseEvent {
  type: "approval_requested";
  step_id: string;
  approval_id: string;
}
export interface ApprovalDecidedEvent extends BaseEvent {
  type: "approval_decided";
  approval_id: string;
  decision: "approved" | "rejected" | "expired";
}
export interface ActionPlanProposedEvent extends BaseEvent {
  type: "action_plan_proposed";
  action_plan_id: string;
  summary: string;
  action_count: number;
}

// ── Artifacts ────────────────────────────────────────────

export interface ArtifactCreatedEvent extends BaseEvent {
  type: "artifact_created";
  artifact_id: string;
  artifact_type: ArtifactType;
  title: string;
}
export interface ArtifactRevisedEvent extends BaseEvent {
  type: "artifact_revised";
  artifact_id: string;
  version: number;
}

// ── Text streaming ───────────────────────────────────────

export interface TextDeltaEvent extends BaseEvent {
  type: "text_delta";
  delta: string;
}

// ── Clarification ────────────────────────────────────────

export interface ClarificationRequestedEvent extends BaseEvent {
  type: "clarification_requested";
  question: string;
  options?: string[];
}

// ── Cost ─────────────────────────────────────────────────

export interface CostUpdatedEvent extends BaseEvent {
  type: "cost_updated";
  cost: RunCost;
}

// ── Retrieval ────────────────────────────────────────────

export interface RetrievalModeInferredEvent extends BaseEvent {
  type: "retrieval_mode_inferred";
  step_id: string;
  task: string;
  inferred_mode: string;
}

// ── Scheduled missions ───────────────────────────────────

export interface ScheduledMissionCreatedEvent extends BaseEvent {
  type: "scheduled_mission_created";
  mission_id: string;
  name: string;
  schedule: string;
}

export interface ScheduledMissionTriggeredEvent extends BaseEvent {
  type: "scheduled_mission_triggered";
  mission_id: string;
  name: string;
}

// ── Assets ───────────────────────────────────────────────

export interface AssetGeneratedEvent extends BaseEvent {
  type: "asset_generated";
  asset_id: string;
  asset_type: AssetType;
  name: string;
  url?: string;
}

// ── Focal Object ─────────────────────────────────────────

export interface FocalObjectReadyEvent extends BaseEvent {
  type: "focal_object_ready";
  focal_object: Record<string, unknown>;
}

// ── Agent selection ──────────────────────────────────────

export interface AgentSelectedEvent extends BaseEvent {
  type: "agent_selected";
  agent_id: string;
  agent_name: string;
  allowed_tools: string[];
  backend: "hearst_runtime" | "anthropic_managed";
  backend_reason: string;
}

// ── Tool surface ─────────────────────────────────────────

export interface ToolSurfaceEvent extends BaseEvent {
  type: "tool_surface";
  context: string;
  tools: Array<{ id: string; label: string; capability: ToolCapability }>;
}

// ── Execution mode ───────────────────────────────────────

export interface ExecutionModeSelectedEvent extends BaseEvent {
  type: "execution_mode_selected";
  mode: string;
  reason: string;
  backend?: string;
}

// ── Orchestrator log ─────────────────────────────────────

export interface OrchestratorLogEvent extends BaseEvent {
  type: "orchestrator_log";
  message: string;
}

// ── Capability blocked ────────────────────────────────────

export interface CapabilityBlockedEvent extends BaseEvent {
  type: "capability_blocked";
  capability: string;
  requiredProviders: string[];
  message: string;
}

// ── Warnings & violations ────────────────────────────────

export interface RuntimeWarningEvent extends BaseEvent {
  type: "runtime_warning";
  message: string;
}
export interface OperatorViolationEvent extends BaseEvent {
  type: "operator_violation";
  step_id: string;
  tool: string;
  violation: string;
}
