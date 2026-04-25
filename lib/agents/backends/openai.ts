/**
 * Agent Backends — OpenAI (Assistants, Responses, Computer Use)
 *
 * Re-exports from backend-v2.
 */

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
} from "../backend-v2/openai-assistant";

export {
  createAssistantSession,
  runAssistantSession,
  streamRunWithTools,
  testAssistantWithTools,
  type AssistantSession,
  type StreamingConfig,
} from "../backend-v2/openai-assistant-v2";

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
} from "../backend-v2/openai-responses";

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
} from "../backend-v2/openai-computer-use";

export {
  registerTool,
  executeTool,
  getAllTools,
  toOpenAITools,
  type ToolDefinition,
  type ToolHandler,
  type ToolCallEvent,
} from "../backend-v2/openai-tools";
