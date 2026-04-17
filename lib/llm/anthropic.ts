import Anthropic from "@anthropic-ai/sdk";
import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk } from "./types";

export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  private client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMessages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const res = await this.client.messages.create({
      model: req.model,
      max_tokens: req.max_tokens ?? 4096,
      temperature: req.temperature,
      top_p: req.top_p,
      system: systemMsg?.content,
      messages: userMessages,
    });

    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");

    return {
      content: text,
      model: res.model,
      provider: this.name,
      tokens_in: res.usage.input_tokens,
      tokens_out: res.usage.output_tokens,
      cost_usd: 0,
      latency_ms: Date.now() - start,
    };
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const systemMsg = req.messages.find((m) => m.role === "system");
    const userMessages = req.messages
      .filter((m) => m.role !== "system")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      }));

    const stream = this.client.messages.stream({
      model: req.model,
      max_tokens: req.max_tokens ?? 4096,
      temperature: req.temperature,
      top_p: req.top_p,
      system: systemMsg?.content,
      messages: userMessages,
    });

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
}
