/**
 * Run Event Bus — Event types.
 *
 * Internal events emitted by the Run Engine and its sub-managers.
 * Consumers (SSEAdapter, LogPersister, analytics) subscribe to these.
 */

import type {
  StepActor,
  RunCost,
} from "../engine/runtime/engine/types";
import type { ArtifactType } from "../artifacts/types";
import type { AssetType } from "../engine/runtime/assets/types";
import type { ToolCapability } from "../tools/types";

// ── Event union ──────────────────────────────────────────

export type RunEvent =
  // Run lifecycle
  | RunCreatedEvent
  | RunStartedEvent
  | RunCompletedEvent
  | RunFailedEvent
  | RunAbortedEvent
  | RunCancelledEvent
  | RunSuspendedEvent
  | RunResumedEvent
  // Plan
  | PlanAttachedEvent
  | PlanPreviewEvent
  // Steps
  | StepStartedEvent
  | StepCompletedEvent
  | StepFailedEvent
  | StepRetryingEvent
  // Multi-step plan execution (Mission Control B1)
  | PlanStepStartedEvent
  | PlanStepCompletedEvent
  | PlanStepAwaitingApprovalEvent
  | PlanStepFailedEvent
  | PlanRunCompleteEvent
  // Delegate
  | DelegateEnqueuedEvent
  | DelegateCompletedEvent
  // Tool calls
  | ToolCallStartedEvent
  | ToolCallCompletedEvent
  // Inline app connect (Composio, per-user)
  | AppConnectRequiredEvent
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
  // Focal object
  | FocalObjectReadyEvent
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
  | OperatorViolationEvent
  // Stage routing — un tool demande à téléporter l'utilisateur sur un Stage
  | StageRequestEvent
  // Browser co-pilot (B5) — Stagehand actions visibles + take-over
  | BrowserActionEvent
  | BrowserTaskCompletedEvent
  | BrowserTaskFailedEvent
  | BrowserTakeOverEvent;

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
export interface RunAbortedEvent extends BaseEvent {
  type: "run_aborted";
  /** Origine de l'abort. `client_requested` = POST /api/orchestrate/abort
   * envoyé par l'UI ; autres valeurs réservées pour futurs cas (timeout, ops). */
  reason: "client_requested";
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

// ── Mission Control multi-step plan ─────────────────────
// Émis par run-planner-workflow lorsqu'un plan multi-step est généré et
// exécuté. Distinct des `step_*` legacy qui modélisent les sous-actes
// d'un seul streamText (StepActor du run engine). Ici chaque step est un
// nœud de l'ExecutionPlan (planner).

export interface PlanPreviewEvent extends BaseEvent {
  type: "plan_preview";
  plan_id: string;
  intent: string;
  steps: Array<{
    id: string;
    kind: string;
    title: string;
    risk: string;
    capability?: string;
  }>;
  estimatedCostUsd: number;
  requiredApps: string[];
}

export interface PlanStepStartedEvent extends BaseEvent {
  type: "plan_step_started";
  plan_id: string;
  step_id: string;
  kind: string;
  label: string;
  plannedAt: number;
}

export interface PlanStepCompletedEvent extends BaseEvent {
  type: "plan_step_completed";
  plan_id: string;
  step_id: string;
  /** Output partiel — preview texte ≤ 400 chars pour l'UI. */
  output?: string;
  costUSD?: number;
  latencyMs?: number;
  providerId?: string;
}

export interface PlanStepAwaitingApprovalEvent extends BaseEvent {
  type: "plan_step_awaiting_approval";
  plan_id: string;
  step_id: string;
  /** Preview du write action (dest, payload résumé). */
  preview: string;
  kind: string;
  providerId?: string;
}

export interface PlanStepFailedEvent extends BaseEvent {
  type: "plan_step_failed";
  plan_id: string;
  step_id: string;
  error: string;
}

export interface PlanRunCompleteEvent extends BaseEvent {
  type: "plan_run_complete";
  plan_id: string;
  /** Asset final (id) si produit. */
  assetId?: string;
  totalCostUsd: number;
  totalLatencyMs: number;
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
  /** Wall-clock latence du tool call en ms (mesurée par l'orchestrator). */
  latencyMs?: number;
  /** Coût attribué au tool call en USD si trackable (LLM-only sinon). */
  costUSD?: number;
}

// ── Inline app connect ───────────────────────────────────
// Emitted when the planner picks `request_connection` to ask the user to
// authorize a third-party app inline in the chat.

export interface AppConnectRequiredEvent extends BaseEvent {
  type: "app_connect_required";
  /** Composio app slug (lowercase). */
  app: string;
  /** One-line message displayed above the connect button. */
  reason: string;
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

// ── Browser co-pilot (B5) ────────────────────────────────
// Streamés par lib/browser/stagehand-executor pendant l'exécution d'une
// tâche autonome ; consommés par BrowserStage (ACTION_LOG live) et par
// le mini-rapport de session.

export type BrowserActionType =
  | "navigate"
  | "click"
  | "type"
  | "scroll"
  | "extract"
  | "screenshot"
  | "observe"
  | "wait";

export interface BrowserAction {
  id: string;
  type: BrowserActionType;
  target: string;
  value?: string;
  screenshotUrl?: string;
  /** ISO string. */
  timestamp: string;
  durationMs?: number;
}

export interface BrowserActionEvent extends BaseEvent {
  type: "browser_action";
  sessionId: string;
  action: BrowserAction;
}

export interface BrowserTaskCompletedEvent extends BaseEvent {
  type: "browser_task_completed";
  sessionId: string;
  summary: string;
  /** Liste d'asset ids créés pendant la session (screenshots/extracts/report). */
  assetIds: string[];
  totalActions: number;
  totalDurationMs: number;
}

export interface BrowserTaskFailedEvent extends BaseEvent {
  type: "browser_task_failed";
  sessionId: string;
  error: string;
  /** Actions effectuées avant l'échec — utile au mini-rapport. */
  totalActions: number;
}

export interface BrowserTakeOverEvent extends BaseEvent {
  type: "browser_take_over";
  sessionId: string;
}

// ── Stage routing ────────────────────────────────────────
// Émis par les tools `start_*` / `generate_*` pour téléporter l'utilisateur
// vers le Stage approprié dès que le tool aboutit. Le payload est un
// StagePayload du store stage (mêmes shapes).

export interface StageRequestEvent extends BaseEvent {
  type: "stage_request";
  stage:
    | { mode: "asset"; assetId: string; variantKind?: string }
    | { mode: "browser"; sessionId: string }
    | { mode: "meeting"; meetingId: string }
    | { mode: "kg"; entityId?: string; query?: string }
    | { mode: "simulation"; scenario?: string }
    | { mode: "voice"; sessionId?: string };
}
