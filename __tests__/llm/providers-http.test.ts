import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ComposerProvider } from "../../lib/llm/composer";
import { GeminiProvider } from "../../lib/llm/gemini";

describe("ComposerProvider HTTP", () => {
  beforeEach(() => {
    process.env.COMPOSER_API_KEY = "k";
    process.env.COMPOSER_API_BASE_URL = "https://composer.test/v1";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.COMPOSER_API_KEY;
    delete process.env.COMPOSER_API_BASE_URL;
  });

  it("parses OpenAI-compatible chat completion JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          choices: [{ message: { content: "ok-composer" } }],
          model: "cursor-composer-2",
          usage: { prompt_tokens: 3, completion_tokens: 7 },
        }),
      ),
    );

    const p = new ComposerProvider();
    const res = await p.chat({
      model: "cursor-composer-2",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.content).toBe("ok-composer");
    expect(res.provider).toBe("composer");
    expect(res.tokens_in).toBe(3);
    expect(res.tokens_out).toBe(7);
    const firstCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const url = typeof firstCall === "string" ? firstCall : (firstCall as Request).url;
    expect(url).toContain("https://composer.test/v1/chat/completions");
  });

  it("throws when COMPOSER_API_KEY is missing", async () => {
    delete process.env.COMPOSER_API_KEY;
    const p = new ComposerProvider();
    await expect(
      p.chat({ model: "m", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/COMPOSER_API_KEY/);
  });
});

describe("GeminiProvider HTTP", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "gk";
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_BASE_URL;
  });

  it("parses generateContent JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          candidates: [{ content: { parts: [{ text: "ok-gemini" }] } }],
          usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 8 },
        }),
      ),
    );

    const p = new GeminiProvider();
    const res = await p.chat({
      model: "gemini-3-flash-preview",
      messages: [{ role: "user", content: "hi" }],
    });

    expect(res.content).toBe("ok-gemini");
    expect(res.provider).toBe("gemini");
    expect(res.tokens_in).toBe(4);
    expect(res.tokens_out).toBe(8);
    const firstCall = (fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const url = typeof firstCall === "string" ? firstCall : (firstCall as Request).url;
    expect(url).toContain("generativelanguage.googleapis.com");
    expect(url).toContain("gemini-3-flash-preview");
    expect(url).toContain("generateContent");
  });

  it("throws when GEMINI_API_KEY is missing", async () => {
    delete process.env.GEMINI_API_KEY;
    const p = new GeminiProvider();
    await expect(
      p.chat({ model: "gemini-3-flash-preview", messages: [{ role: "user", content: "x" }] }),
    ).rejects.toThrow(/GEMINI_API_KEY/);
  });
});
