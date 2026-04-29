import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk, ChatMessage } from "./types";
import { sanitizeProviderError } from "./errors";
import { makeAbortSignal, CHAT_TIMEOUT_MS, STREAM_TIMEOUT_MS } from "./timeout";

/**
 * Cursor Composer 2 — OpenAI-compatible `POST /v1/chat/completions`.
 *
 * Env:
 * - `COMPOSER_API_KEY` (required for `chat()` / `streamChat()`)
 * - `COMPOSER_API_BASE_URL` — root including `/v1` (default `https://api.cursor.com/v1`).
 *   Override with your gateway if Cursor exposes a different inference host.
 *
 * Model id comes from `ChatRequest.model` / `model_profiles.model` (e.g. `cursor-composer-2`,
 * `cursor-composer-2-fast`).
 *
 * No extra npm dependency: uses `fetch` (Node 18+ / Next runtime).
 */

function mapMessages(messages: ChatMessage[]): Array<{ role: "system" | "user" | "assistant"; content: string }> {
  return messages.map((m) => {
    if (m.role === "tool") {
      return { role: "user", content: `[tool]\n${m.content}` };
    }
    if (m.role === "system" || m.role === "user" || m.role === "assistant") {
      return { role: m.role, content: m.content };
    }
    return { role: "user", content: m.content };
  });
}

function chatCompletionsUrl(base: string): string {
  const trimmed = base.replace(/\/+$/, "");
  return `${trimmed}/chat/completions`;
}

export class ComposerProvider implements LLMProvider {
  readonly name = "composer";

  private getAuthHeader(apiKey: string): string {
    const mode = (process.env.COMPOSER_AUTH_MODE ?? "bearer").toLowerCase();
    if (mode === "basic") {
      const pair = `${apiKey}:`;
      const token =
        typeof Buffer !== "undefined"
          ? Buffer.from(pair, "utf8").toString("base64")
          : btoa(pair);
      return `Basic ${token}`;
    }
    return `Bearer ${apiKey}`;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const apiKey = process.env.COMPOSER_API_KEY;
    if (!apiKey) {
      throw new Error("COMPOSER_API_KEY is not set — add it to .env.local");
    }
    const base = process.env.COMPOSER_API_BASE_URL ?? "https://api.cursor.com/v1";
    const start = Date.now();
    const timeoutMs = req.timeoutMs ?? CHAT_TIMEOUT_MS;
    const signal = makeAbortSignal(timeoutMs, req.signal);

    const res = await fetch(chatCompletionsUrl(base), {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        messages: mapMessages(req.messages),
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        top_p: req.top_p,
        stream: false,
      }),
      signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("composer.chat http_error", { status: res.status, bodyPreview: raw.slice(0, 500) });
      throw new Error(sanitizeProviderError(res.status, raw));
    }

    let json: {
      choices?: Array<{ message?: { content?: string | null } }>;
      model?: string;
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch (e) {
      console.error("composer.chat json_parse", { message: e instanceof Error ? e.message : String(e) });
      throw new Error("Composer API returned non-JSON body");
    }

    const tokensIn = json.usage?.prompt_tokens ?? 0;
    const tokensOut = json.usage?.completion_tokens ?? 0;
    const content = json.choices?.[0]?.message?.content ?? "";

    return {
      content: typeof content === "string" ? content : "",
      model: json.model ?? req.model,
      provider: this.name,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: 0,
      latency_ms: Date.now() - start,
    };
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const apiKey = process.env.COMPOSER_API_KEY;
    if (!apiKey) {
      throw new Error("COMPOSER_API_KEY is not set — add it to .env.local");
    }
    const base = process.env.COMPOSER_API_BASE_URL ?? "https://api.cursor.com/v1";
    const timeoutMs = req.timeoutMs ?? STREAM_TIMEOUT_MS;
    const signal = makeAbortSignal(timeoutMs, req.signal);

    const res = await fetch(chatCompletionsUrl(base), {
      method: "POST",
      headers: {
        Authorization: this.getAuthHeader(apiKey),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: req.model,
        messages: mapMessages(req.messages),
        temperature: req.temperature,
        max_tokens: req.max_tokens,
        top_p: req.top_p,
        stream: true,
      }),
      signal,
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      console.error("composer.streamChat http_error", { status: res.status, bodyPreview: t.slice(0, 500) });
      throw new Error(sanitizeProviderError(res.status, t));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data:")) continue;
          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            yield { delta: "", done: true };
            return;
          }
          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string }; finish_reason?: string | null }>;
            };
            const delta = chunk.choices?.[0]?.delta?.content ?? "";
            const fr = chunk.choices?.[0]?.finish_reason;
            if (delta) yield { delta, done: false };
            if (fr) {
              yield { delta: "", done: true };
              return;
            }
          } catch {
            /* ignore partial JSON lines */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { delta: "", done: true };
  }
}
