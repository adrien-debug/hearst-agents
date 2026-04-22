/**
 * Agent Backend V2 — Barrel export.
 *
 * Unified multi-provider agent execution layer.
 */

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
} from "./types";

export { BACKEND_CAPABILITIES } from "./types";

// Implementation exports (to be implemented)
// export { BackendSelector } from "./selector";
// export { HybridRouter } from "./hybrid-router";
// export { AnthropicBackend } from "./anthropic-backend";
// export { OpenAIBackend } from "./openai-backend";
