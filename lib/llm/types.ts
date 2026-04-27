export interface ChatMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: unknown[];
  /**
   * Anthropic-style cache breakpoint. When set on a message, that message —
   * along with everything before it in the prompt — becomes a cacheable prefix
   * (5-min ephemeral TTL). Caching only kicks in past Anthropic's minimum
   * (1024 tokens for Sonnet/Haiku, 2048 for Opus). Ignored by other providers.
   */
  cache_control?: { type: "ephemeral" };
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export interface ChatResponse {
  content: string;
  model: string;
  provider: string;
  tokens_in: number;
  tokens_out: number;
  cost_usd: number;
  latency_ms: number;
  /** Anthropic-only: tokens written to cache this turn (~125% of input rate). */
  cache_creation_tokens?: number;
  /** Anthropic-only: tokens read from cache this turn (~10% of input rate). */
  cache_read_tokens?: number;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
}

export interface LLMProvider {
  readonly name: string;
  chat(req: ChatRequest): Promise<ChatResponse>;
  streamChat(req: ChatRequest): AsyncGenerator<StreamChunk>;
}

export interface ModelProfileConfig {
  provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  top_p: number;
  cost_per_1k_in: number;
  cost_per_1k_out: number;
  max_cost_per_run: number | null;
  fallback_profile_id: string | null;
}
