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
  name: string;
  description: string;
  supportsStreaming: boolean;
  supportsTools: boolean;
  supportsVision: boolean;
  supportsComputerUse: boolean;
  supportsFileSearch: boolean;
  supportsCodeInterpreter: boolean;
  /** Supports persistent thread/conversation */
  supportsPersistence: boolean;
  maxContextWindow: number;
  /** Cost level for comparison */
  costLevel: "low" | "medium" | "high";
  costTier: "low" | "medium" | "high"; // Legacy alias
  /** Latency profile */
  latencyProfile: "fast" | "medium" | "slow";
  /** Reasoning capability level */
  reasoningLevel: "low" | "medium" | "high";
  /** Reliability score 0-1 based on telemetry */
  reliabilityScore: number;
  /** Average latency in ms */
  avgLatencyMs: number;
}

// ── Backend Capability Registry ──────────────────────────────

export const BACKEND_CAPABILITIES: Record<AgentBackendV2, BackendCapabilities> = {
  hearst_runtime: {
    id: "hearst_runtime",
    name: "Hearst Runtime",
    description: "Internal step-by-step execution engine",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: false,
    supportsComputerUse: false,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    supportsPersistence: false,
    maxContextWindow: 128_000,
    costLevel: "low",
    costTier: "low",
    latencyProfile: "fast",
    reasoningLevel: "medium",
    reliabilityScore: 0.98,
    avgLatencyMs: 500,
  },
  anthropic_sessions: {
    id: "anthropic_sessions",
    name: "Anthropic Sessions",
    description: "Claude managed sessions with 200K context",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: false,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    supportsPersistence: true,
    maxContextWindow: 200_000,
    costLevel: "medium",
    costTier: "medium",
    latencyProfile: "medium",
    reasoningLevel: "high",
    reliabilityScore: 0.95,
    avgLatencyMs: 2000,
  },
  openai_assistants: {
    id: "openai_assistants",
    name: "OpenAI Assistants",
    description: "Full-featured assistants with tools and file search",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: false,
    supportsFileSearch: true,
    supportsCodeInterpreter: true,
    supportsPersistence: true,
    maxContextWindow: 128_000,
    costLevel: "medium",
    costTier: "medium",
    latencyProfile: "medium",
    reasoningLevel: "high",
    reliabilityScore: 0.96,
    avgLatencyMs: 1500,
  },
  openai_responses: {
    id: "openai_responses",
    name: "OpenAI Responses",
    description: "Fast stateless responses for simple queries",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: false,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    supportsPersistence: false,
    maxContextWindow: 128_000,
    costLevel: "low",
    costTier: "low",
    latencyProfile: "fast",
    reasoningLevel: "medium",
    reliabilityScore: 0.97,
    avgLatencyMs: 1000,
  },
  openai_computer_use: {
    id: "openai_computer_use",
    name: "OpenAI Computer Use",
    description: "Computer control with vision and actions",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: true,
    supportsFileSearch: false,
    supportsCodeInterpreter: false,
    supportsPersistence: false,
    maxContextWindow: 128_000,
    costLevel: "high",
    costTier: "high",
    latencyProfile: "slow",
    reasoningLevel: "high",
    reliabilityScore: 0.90,
    avgLatencyMs: 5000,
  },
  hybrid: {
    id: "hybrid",
    name: "Hybrid Router",
    description: "Intelligent multi-backend orchestration",
    supportsStreaming: true,
    supportsTools: true,
    supportsVision: true,
    supportsComputerUse: true,
    supportsFileSearch: true,
    supportsCodeInterpreter: true,
    supportsPersistence: true,
    maxContextWindow: 200_000,
    costLevel: "high",
    costTier: "high",
    latencyProfile: "medium",
    reasoningLevel: "high",
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
  /** Additional context about the request */
  context?: string;
  /** Explicit complexity if known (0-100), otherwise auto-detected */
  complexity?: number;
  needsVision?: boolean;
  needsBrowsing?: boolean;
  needsCodeExecution?: boolean;
  needsFileSearch?: boolean;
  needsComputerUse?: boolean;
  estimatedSteps?: number;
  userTier?: "free" | "pro" | "enterprise";
  /** Preferred backend if user has explicit preference */
  preferredBackend?: AgentBackendV2;
}

export interface BackendSelectionResult {
  selectedBackend: AgentBackendV2;
  confidence: number; // 0-1
  reasoning: string[];
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  /** Chain of fallback backends if primary fails */
  fallbackChain: AgentBackendV2[];
  routingDecision: "auto" | "forced" | "recommended";
  /** Internal metadata for debugging */
  _meta?: {
    analysis: TaskAnalysis;
    allScores: BackendScore[];
    decisionTimeMs: number;
  };
}

export interface TaskAnalysis {
  complexity: number;
  needsPersistence: boolean;
  needsTools: boolean;
  needsFileSearch: boolean;
  needsCodeInterpreter: boolean;
  needsVision: boolean;
  needsComputerUse: boolean;
  isSimpleQa: boolean;
  isConversation: boolean;
  needsRealtimeData: boolean;
}

export interface BackendScore {
  backend: AgentBackendV2;
  score: number;
  confidence: number;
  reasons: string[];
  estimatedCostUsd: number;
  estimatedLatencyMs: number;
  warnings: string[];
}

// ── Hybrid Routing ───────────────────────────────────────────

export interface HybridExecutionPlan {
  steps: HybridStep[];
  totalEstimatedCostUsd: number;
  totalEstimatedLatencyMs: number;
  fallbackStrategy: "sequential" | "parallel" | "abort";
}

export interface HybridStep {
  backend: AgentBackendV2;
  task: string;
  input: Record<string, unknown>;
  dependsOn: string | null;
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
