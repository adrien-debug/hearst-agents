/**
 * Core Types — Agents
 *
 * Canonical re-exports for agent-related types.
 */

export type { AgentDefinition } from "@/lib/agents/types";

export type {
  AgentBackend,
  AgentBackendDecision,
} from "@/lib/agents/backends/types";

export type {
  AgentBackendV2,
  BackendCapabilities,
  ManagedSessionConfig,
  ManagedSessionContext,
  ManagedAgentEvent,
  ManagedAgentEventType,
  ManagedAgentResult,
  ManagedAgentStep,
  BackendSelectionInput,
  BackendSelectionResult,
  HybridExecutionPlan,
  HybridStep,
  HandoffContext,
  HandoffResult,
} from "@/lib/agents/backend-v2/types";

export type {
  CapabilityAgent,
} from "@/lib/engine/runtime/delegate/types";

export type {
  StepActor,
} from "@/lib/engine/runtime/engine/types";
