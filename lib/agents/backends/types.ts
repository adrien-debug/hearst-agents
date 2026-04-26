/**
 * Agent Backends — Unified types
 *
 * Merges backend v1 (hearst_runtime, anthropic_managed) and
 * backend v2 (openai_assistants, openai_responses, openai_computer_use, hybrid).
 */

// V1 types (inlined after backend/ removal)
export type AgentBackend = "hearst_runtime" | "anthropic_managed";

export interface AgentBackendDecision {
  backend: AgentBackend;
  reason: string;
}

// V2 types (comprehensive)
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
  TaskAnalysis,
  BackendScore,
} from "../backend-v2/types";

export { BACKEND_CAPABILITIES } from "../backend-v2/types";
