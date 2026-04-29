import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatRequest, ChatMessage, ChatResponse, StreamChunk } from "./types";
import { makeAbortSignal, CHAT_TIMEOUT_MS, STREAM_TIMEOUT_MS } from "./timeout";

export interface ToolUseRequest {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface AnthropicToolMessage {
  role: "user" | "assistant";
  content: Anthropic.MessageParam["content"];
}

export interface ToolChatResult {
  text: string;
  toolCalls: ToolUseRequest[];
  stopReason: string;
  tokensIn: number;
  tokensOut: number;
  cacheCreationTokens: number;
  cacheReadTokens: number;
  rawResponse: Anthropic.Message;
}

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY is not set — add it to .env.local");
    }
    this.client = new Anthropic({ apiKey });
  }

  /**
   * Single-turn chat with optional tool definitions.
   * Returns tool_use blocks if the model wants to call tools.
   */
  async chatWithTools(
    req: ChatRequest,
    tools?: Anthropic.Tool[],
  ): Promise<ToolChatResult> {
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMessages = this.buildMessages(req);

    const params = this.buildParams(req, systemMsg, userMessages);

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    const signal = makeAbortSignal(CHAT_TIMEOUT_MS, req.signal);
    const res = await this.client.messages.create({ ...params, stream: false }, { signal });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    const toolCalls = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));

    return {
      text,
      toolCalls,
      stopReason: res.stop_reason ?? "end_turn",
      tokensIn: res.usage.input_tokens,
      tokensOut: res.usage.output_tokens,
      cacheCreationTokens: res.usage.cache_creation_input_tokens ?? 0,
      cacheReadTokens: res.usage.cache_read_input_tokens ?? 0,
      rawResponse: res,
    };
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const result = await this.chatWithTools(req);

    return {
      content: result.text,
      model: req.model,
      provider: this.name,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: 0,
      latency_ms: Date.now() - start,
      ...(result.cacheCreationTokens ? { cache_creation_tokens: result.cacheCreationTokens } : {}),
      ...(result.cacheReadTokens ? { cache_read_tokens: result.cacheReadTokens } : {}),
    };
  }

  async *streamChat(req: ChatRequest, tools?: Anthropic.Tool[]): AsyncGenerator<StreamChunk> {
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMessages = this.buildMessages(req);

    const params = this.buildParams(req, systemMsg, userMessages);

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    const signal = makeAbortSignal(STREAM_TIMEOUT_MS, req.signal);
    const stream = this.client.messages.stream(params as Anthropic.MessageStreamParams, { signal });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        yield { delta: event.delta.text, done: false };
      }
      if (event.type === "message_stop") {
        yield { delta: "", done: true };
      }
    }
  }

  private buildParams(
    req: ChatRequest,
    systemMsg: ChatMessage | undefined,
    messages: Anthropic.MessageParam[],
  ): Anthropic.MessageCreateParams {
    const params: Anthropic.MessageCreateParams = {
      model: req.model,
      max_tokens: req.max_tokens ?? 4096,
      system: this.buildSystem(systemMsg),
      messages,
    };
    // Anthropic newer models reject temperature + top_p together
    if (req.temperature != null) {
      params.temperature = req.temperature;
    } else if (req.top_p != null) {
      params.top_p = req.top_p;
    }
    return params;
  }

  /**
   * If the system message carries a cache_control hint, send it as a single
   * cacheable text content block. Otherwise pass the raw string for the
   * smallest possible request payload.
   */
  private buildSystem(
    systemMsg: ChatMessage | undefined,
  ): Anthropic.MessageCreateParams["system"] {
    if (!systemMsg) return undefined;
    if (systemMsg.cache_control) {
      return [
        {
          type: "text",
          text: systemMsg.content,
          cache_control: systemMsg.cache_control,
        },
      ];
    }
    return systemMsg.content;
  }

  private buildMessages(req: ChatRequest): Anthropic.MessageParam[] {
    return req.messages
      .filter((m) => m.role !== "system")
      .map((m) => {
        if (m.cache_control) {
          return {
            role: m.role as "user" | "assistant",
            content: [
              {
                type: "text" as const,
                text: m.content,
                cache_control: m.cache_control,
              },
            ],
          };
        }
        return {
          role: m.role as "user" | "assistant",
          content: m.content,
        };
      });
  }
}
