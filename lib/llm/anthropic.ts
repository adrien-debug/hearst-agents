import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk } from "./types";

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

    const params = this.buildParams(req, systemMsg?.content, userMessages);

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    const res = await this.client.messages.create({ ...params, stream: false });

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
    };
  }

  async *streamChat(req: ChatRequest, tools?: Anthropic.Tool[]): AsyncGenerator<StreamChunk> {
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMessages = this.buildMessages(req);

    const params = this.buildParams(req, systemMsg?.content, userMessages);

    if (tools && tools.length > 0) {
      params.tools = tools;
    }

    const stream = this.client.messages.stream(params as Anthropic.MessageStreamParams);

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
    system: string | undefined,
    messages: Anthropic.MessageParam[],
  ): Anthropic.MessageCreateParams {
    const params: Anthropic.MessageCreateParams = {
      model: req.model,
      max_tokens: req.max_tokens ?? 4096,
      system,
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

  private buildMessages(req: ChatRequest): Anthropic.MessageParam[] {
    return req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));
  }
}
