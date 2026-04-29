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
  resetLlmProviderCache,
  resolveModelProfile,
  loadFallbackChain,
  chatWithProfile,
  streamChatWithProfile,
  smartChat,
  smartStreamChat,
} from "./router";
export type { ModelDecision, SmartChatOptions } from "./router";

export {
  CostLimitExceededError,
  RateLimitExceededError,
  LLMTimeoutError,
  CircuitOpenError,
} from "./errors";

export { defaultRateLimiter } from "./rate-limiter";
export type { RateLimiterOptions } from "./rate-limiter";

export { defaultCircuitBreaker } from "./circuit-breaker";
export type { CircuitState } from "./circuit-breaker";

export { defaultMetrics, getMetrics, LLMMetricsAggregator } from "./metrics";
export type {
  MetricsSnapshot,
  ProviderMetrics,
  CounterKind,
  RecordCallInput,
  RecordErrorInput,
} from "./metrics";
