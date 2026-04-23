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

// ── OpenAI Assistants Backend ────────────────────────────────

export {
  createOrGetAssistant,
  createThread,
  addMessageToThread,
  runAssistant,
  streamRun,
  runOpenAIAssistantSession,
  testAssistantBackend,
  type AssistantConfig,
  type ThreadMessage,
} from "./openai-assistant";

// ── Future Implementations ──────────────────────────────────

// export { BackendSelector } from "./selector";
// export { HybridRouter } from "./hybrid-router";
// export { AnthropicBackend } from "./anthropic-backend";
// export { OpenAIResponsesBackend } from "./openai-responses";
// export { OpenAIComputerUseBackend } from "./openai-computer-use";
