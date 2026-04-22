/**
 * Agent Backend V2 — Unified types for multi-provider managed agents.
 *
 * Unifies: Anthropic Sessions, OpenAI Assistants/Responses/Computer Use
 * Goal: Single interface, multiple backends, intelligent routing.
 */

// ── Backend Registry ─────────────────────────────────────────

export type AgentBackendV2 =
  | "hearst_runtime" // Step-by-step controlled execution
  | "anthropic_sessions" // Anthropic Managed Sessions
  | "openai_assistants" // OpenAI Assistants API
  | "openai_responses" // OpenAI Responses API
  | "openai_computer_use" // OpenAI Computer Use API
  | "hybrid"; // Multi-provider intelligent routing

export interface BackendCapabilities {
  id: AgentBackendV2;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsComputerUse: boolean;
  supportsFileSearch: boolean;
  supportsCodeInterpreter: boolean;
  maxContextWindow: number;
  costTier: "low" | "medium" | "high";
  /** Reliability score 0-1 based on telemetry */
  reliabilityScore: number;
  /** Average latency in ms */
  avgLatencyMs: number;
}

// ── Backend Capability Registry ──────────────────────────────

export const BACKEND_CAPABILITIES: Record<AgentBackendV2, BackendCapabilities> = {
  hearst_runtime: {
    id: "hearst_runtime",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsComputerUse: false,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    maxContextWindow: 128_000,
    costTier: "low",
    reliabilityScore: 0.98,
    avgLatencyMs: 500,
  },
  anthropic_sessions: {
    id: "anthropic_sessions",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: false,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    maxContextWindow: 200_000,
    costTier: "medium",
    reliabilityScore: 0.95,
    avgLatencyMs: 2000,
  },
  openai_assistants: {
    id: "openai_assistants",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: false,
    supportsFileSearch: true,
    supportsCodeInterpreter: true,
    maxContextWindow: 128_000,
    costTier: "medium",
    reliabilityScore: 0.96,
    avgLatencyMs: 1500,
  },
  openai_responses: {
    id: "openai_responses",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: false,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    maxContextWindow: 128_000,
    costTier: "low",
    reliabilityScore: 0.97,
    avgLatencyMs: 1000,
  },
  openai_computer_use: {
    id: "openai_computer_use",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: true,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    maxContextWindow: 128_000,
    costTier: "high",
    reliabilityScore: 0.90,
    avgLatencyMs: 5000,
  },
  hybrid: {
    id: "hybrid",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: true,
    supportsFileSearch: true,
    supportsCodeInterpreter: true,
    maxContextWindow: 200_000,
    costTier: "high",
    reliabilityScore: 0.94,
    avgLatencyMs: 3000,
  },
};

// ── Session Management ─────────────────────────────────────

export interface ManagedSessionConfig {
  backend: AgentBackendV2;
  prompt: string;
  runId: string;
  threadId?: string; // For conversation continuity
  tenantId: string;
  workspaceId: string;
  userId?: string;
  agentId?: string;
  /** Maximum cost budget for this session in USD */
  costBudgetUsd?: number;
  /** Timeout in seconds */
  timeoutSeconds?: number;
}

export interface ManagedSessionContext {
  sessionId: string;
  backend: AgentBackendV2;
  threadId?: string;
  assistantId?: string;
  createdAt: number;
  status: "created" | "running" | "completed" | "failed" | "cancelled";
}

// ── Unified Events ───────────────────────────────────────────

export type ManagedAgentEventType =
  | "step"
  | "message"
  | "tool_call"
  | "tool_result"
  | "screenshot" // Computer Use specific
  | "action" // Computer Use specific
  | "thinking"
  | "idle"
  | "error"
  | "budget_exceeded"
  | "timeout";

export interface ManagedAgentEvent {
  type: ManagedAgentEventType;
  timestamp: number;
  /** Tool name for step/tool_call events */
  tool?: string;
  /** Action type for Computer Use (click, type, scroll, etc.) */
  action?: string;
  /** Status of the step/action */
  status?: "running" | "done" | "error" | "pending_approval";
  /** Text content for message/thinking events */
  content?: string;
  /** Delta for streaming content */
  delta?: string;
  /** Screenshot URL for Computer Use events */
  screenshotUrl?: string;
  /** Error message */
  error?: string;
  /** Usage stats if available */
  usage?: {
    tokensIn?: number;
    tokensOut?: number;
    costUsd?: number;
  };
}

// ── Execution Results ───────────────────────────────────────

export interface ManagedAgentResult {
  text: string;
  status: "completed" | "failed" | "cancelled" | "timeout";
  steps: ManagedAgentStep[];
  usage: {
    tokensIn: number;
    tokensOut: number;
    costUsd: number;
    durationMs: number;
  };
  backend: AgentBackendV2;
  /** Session context for potential continuation */
  sessionContext?: ManagedSessionContext;
}

export interface ManagedAgentStep {
  id: string;
  type: "tool_call" | "thinking" | "action" | "message";
  tool?: string;
  action?: string;
  input?: Record<string, unknown>;
  output?: unknown;
  status: "running" | "done" | "error";
  startedAt: number;
  completedAt?: number;
  error?: string;
}

// ── Backend Selector Input ─────────────────────────────────

export interface BackendSelectionInput {
  prompt: string;
  context: string;
  complexity: number; // 1-10
  needsVision: boolean;
  needsBrowsing: boolean;
  needsCodeExecution: boolean;
  needsFileSearch: boolean;
  estimatedSteps: number;
  userTier: "free" | "pro" | "enterprise";
  /** Preferred backend if user has explicit preference */
  preferredBackend?: AgentBackendV2;
}

export interface BackendSelectionResult {
  backend: AgentBackendV2;
  reason: string;
  confidence: number; // 0-1
  alternatives: AgentBackendV2[];
  estimatedCostUsd: number;
  estimatedDurationMs: number;
}

// ── Hybrid Routing ───────────────────────────────────────────

export interface HybridExecutionPlan {
  steps: HybridStep[];
  totalEstimatedCost: number;
  totalEstimatedDuration: number;
  fallbackStrategy: "abort" | "degrade" | "retry_single";
}

export interface HybridStep {
  id: string;
  intent: string;
  selectedBackend: AgentBackendV2;
  alternatives: AgentBackendV2[];
  requiresApproval: boolean;
  estimatedCostUsd: number;
  dependencies: string[]; // Step IDs that must complete first
}

// ── Handoff Protocol ────────────────────────────────────────

export interface HandoffContext {
  fromBackend: AgentBackendV2;
  toBackend: AgentBackendV2;
  conversationHistory: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  artifacts: Array<{ type: string; content: unknown }>;
  metadata: Record<string, unknown>;
}

export interface HandoffResult {
  success: boolean;
  newSessionContext?: ManagedSessionContext;
  error?: string;
}
