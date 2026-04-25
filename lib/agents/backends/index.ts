/**
 * Agent Backends — Unified barrel export
 *
 * Architecture Finale: lib/agents/backends/
 * Combines v1 (hearst_runtime, anthropic_managed) and v2
 * (openai_assistants, openai_responses, openai_computer_use, hybrid).
 */

// Types
export type {
  AgentBackend,
  AgentBackendDecision,
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

// Selectors
export {
  selectAgentBackend,
} from "./selector";

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

// Anthropic
export { runAnthropicManaged } from "./anthropic";

// OpenAI
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
  createAssistantSession,
  runAssistantSession,
  streamRunWithTools,
  testAssistantWithTools,
  type AssistantSession,
  type StreamingConfig,
  generateResponse,
  streamResponse,
  quickResponse,
  quickStream,
  ResponsesSession,
  testResponsesBackend,
  testResponsesSession,
  type ResponsesConfig,
  type ResponseInput,
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
  registerTool,
  executeTool,
  getAllTools,
  toOpenAITools,
  type ToolDefinition,
  type ToolHandler,
  type ToolCallEvent,
} from "./openai";
