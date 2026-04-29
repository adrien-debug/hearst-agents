import type { LLMProvider, ChatRequest, ChatResponse, StreamChunk } from "./types";
import { sanitizeProviderError } from "./errors";
import { makeAbortSignal, CHAT_TIMEOUT_MS, STREAM_TIMEOUT_MS } from "./timeout";

/**
 * Google Gemini (Gemini API) — REST `generateContent` / `streamGenerateContent`.
 *
 * Env:
 * - `GEMINI_API_KEY` (required for `chat()` / `streamChat()`)
 * - `GEMINI_API_BASE_URL` optional (default `https://generativelanguage.googleapis.com`)
 *
 * Model id from `ChatRequest.model` (e.g. `gemini-3-flash-preview` for Gemini 3 Flash).
 *
 * Auth: `x-goog-api-key` header (see https://ai.google.dev/gemini-api/docs ).
 * No extra npm dependency: uses `fetch`.
 */

const DEFAULT_GEMINI_HOST = "https://generativelanguage.googleapis.com";

function buildGeminiPayload(req: ChatRequest): Record<string, unknown> {
  const systemParts = req.messages
    .filter((m) => m.role === "system")
    .map((m) => ({ text: m.content }));

  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
  for (const m of req.messages) {
    if (m.role === "system") continue;
    const role = m.role === "assistant" ? "model" : "user";
    const text =
      m.role === "tool"
        ? `[tool]\n${m.content}`
        : m.content;
    contents.push({ role, parts: [{ text }] });
  }

  const payload: Record<string, unknown> = {
    contents,
    generationConfig: {
      ...(req.temperature != null ? { temperature: req.temperature } : {}),
      ...(req.top_p != null ? { topP: req.top_p } : {}),
      ...(req.max_tokens != null ? { maxOutputTokens: req.max_tokens } : {}),
    },
  };

  if (systemParts.length > 0) {
    payload.systemInstruction = { parts: systemParts };
  }

  return payload;
}

export class GeminiProvider implements LLMProvider {
  readonly name = "gemini";

  private baseUrl(): string {
    return (process.env.GEMINI_API_BASE_URL ?? DEFAULT_GEMINI_HOST).replace(/\/+$/, "");
  }

  private generateUrl(model: string, stream: boolean): string {
    const action = stream ? "streamGenerateContent" : "generateContent";
    const enc = encodeURIComponent(model);
    return `${this.baseUrl()}/v1beta/models/${enc}:${action}`;
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set — add it to .env.local");
    }
    const start = Date.now();
    const url = this.generateUrl(req.model, false);
    const timeoutMs = req.timeoutMs ?? CHAT_TIMEOUT_MS;
    const signal = makeAbortSignal(timeoutMs, req.signal);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildGeminiPayload(req)),
      signal,
    });

    const raw = await res.text();
    if (!res.ok) {
      console.error("gemini.chat http_error", { status: res.status, bodyPreview: raw.slice(0, 500) });
      throw new Error(sanitizeProviderError(res.status, raw));
    }

    let json: {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      usageMetadata?: {
        promptTokenCount?: number;
        candidatesTokenCount?: number;
      };
    };
    try {
      json = JSON.parse(raw) as typeof json;
    } catch (e) {
      console.error("gemini.chat json_parse", { message: e instanceof Error ? e.message : String(e) });
      throw new Error("Gemini API returned non-JSON body");
    }

    const text =
      json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("") ?? "";

    const tokensIn = json.usageMetadata?.promptTokenCount ?? 0;
    const tokensOut = json.usageMetadata?.candidatesTokenCount ?? 0;

    return {
      content: text,
      model: req.model,
      provider: this.name,
      tokens_in: tokensIn,
      tokens_out: tokensOut,
      cost_usd: 0,
      latency_ms: Date.now() - start,
    };
  }

  async *streamChat(req: ChatRequest): AsyncGenerator<StreamChunk> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set — add it to .env.local");
    }
    const url = this.generateUrl(req.model, true);
    const timeoutMs = req.timeoutMs ?? STREAM_TIMEOUT_MS;
    const signal = makeAbortSignal(timeoutMs, req.signal);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(buildGeminiPayload(req)),
      signal,
    });

    if (!res.ok || !res.body) {
      const t = await res.text().catch(() => "");
      console.error("gemini.streamChat http_error", { status: res.status, bodyPreview: t.slice(0, 500) });
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

        const chunks = buffer.split("\n");
        buffer = chunks.pop() ?? "";

        for (const block of chunks) {
          const line = block.trim();
          if (!line) continue;
          let jsonStr = line;
          if (line.startsWith("data:")) jsonStr = line.slice(5).trim();
          if (!jsonStr || jsonStr === "[DONE]") continue;

          try {
            const obj = JSON.parse(jsonStr) as {
              candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
            };
            const piece =
              obj.candidates?.[0]?.content?.parts
                ?.map((p) => p.text ?? "")
                .join("") ?? "";
            if (piece) yield { delta: piece, done: false };
          } catch {
            /* ignore framing / partial JSON */
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { delta: "", done: true };
  }
}
