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
  TaskAnalysis,
  BackendScore,
} from "./types";

export { BACKEND_CAPABILITIES } from "./types";

// ── OpenAI Assistants Backend V1 (Basic) ─────────────────────

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

// ── OpenAI Assistants Backend V2 (Advanced) ───────────────────

export {
  createAssistantSession,
  runAssistantSession,
  streamRunWithTools,
  testAssistantWithTools,
  type AssistantSession,
  type StreamingConfig,
} from "./openai-assistant-v2";

// ── Tool System ───────────────────────────────────────────────

export {
  registerTool,
  executeTool,
  getAllTools,
  toOpenAITools,
  type ToolDefinition,
  type ToolHandler,
  type ToolCallEvent,
} from "./openai-tools";

// ── OpenAI Responses API Backend ─────────────────────────────

export {
  generateResponse,
  streamResponse,
  quickResponse,
  quickStream,
  ResponsesSession,
  testResponsesBackend,
  testResponsesSession,
  type ResponsesConfig,
  type ResponseInput,
} from "./openai-responses";

// ── OpenAI Computer Use API Backend ──────────────────────────

export {
  createComputerSession,
  encodeImageToBase64,
  executeComputerStep,
  runComputerTask,
  createMockScreenshot,
  mockExecuteAction,
  testComputerUseBackend,
  testComputerUseWithMock,
  type ComputerUseConfig,
  type Screenshot,
  type ComputerAction,
  type ComputerSession,
} from "./openai-computer-use";

// ── Backend Selector ────────────────────────────────────────

export {
  analyzeTask,
  scoreBackends,
  selectBackend,
  planHybridExecution,
  isBackendAvailable,
  listAvailableBackends,
  recommendFor,
  testSelector,
  testHybridPlanning,
  type SelectorConfig,
} from "./selector";

// ── Future Implementations ──────────────────────────────────

// export { HybridRouter } from "./hybrid-router";
// export { AnthropicBackend } from "./anthropic-backend";
