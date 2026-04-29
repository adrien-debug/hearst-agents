import OpenAI from "openai";
import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk } from "./types";
import { makeAbortSignal, CHAT_TIMEOUT_MS, STREAM_TIMEOUT_MS } from "./timeout";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private client: OpenAI;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is not set — add it to .env.local");
    }
    this.client = new OpenAI({ apiKey });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? CHAT_TIMEOUT_MS;
    const signal = makeAbortSignal(timeoutMs, req.signal);
    const res = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: req.temperature,
      max_tokens: req.max_tokens,
      top_p: req.top_p,
    }, { signal });

    const tokensIn = res.usage?.prompt_tokens ?? 0;
    const tokensOut = res.usage?.completion_tokens ?? 0;

    return {
      content: res.choices[0]?.message?.content ?? "",
      model: res.model,
      provider: this.name,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: 0,
      latency_ms: Date.now() - start,
    };
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const timeoutMs = req.timeoutMs ?? STREAM_TIMEOUT_MS;
    const signal = makeAbortSignal(timeoutMs, req.signal);
    const stream = await this.client.chat.completions.create({
      model: req.model,
      messages: req.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: req.temperature,
      max_tokens: req.max_tokens,
      top_p: req.top_p,
      stream: true,
    }, { signal });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content ?? "";
      const done = chunk.choices[0]?.finish_reason !== null;
      if (delta || done) {
        yield { delta, done };
      }
    }
  }
}
