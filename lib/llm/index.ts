export type {
  ChatMessage,
  ChatRequest,
  ChatResponse,
  StreamChunk,
  LLMProvider,
  ModelProfileConfig,
} from "./types";

export {
  getProvider,
  resolveModelProfile,
  loadFallbackChain,
  chatWithProfile,
  streamChatWithProfile,
  smartChat,
  smartStreamChat,
} from "./router";
export type { ModelDecision, SmartChatOptions } from "./router";
