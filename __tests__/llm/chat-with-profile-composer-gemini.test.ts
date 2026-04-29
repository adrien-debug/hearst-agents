import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import type { ModelProfileConfig } from "../../lib/llm/types";
import { chatWithProfile, resetLlmProviderCache } from "../../lib/llm/router";

describe("chatWithProfile — composer → gemini chain", () => {
  const composerId = "a1e2f3a4-b5c6-4789-a012-000000000001";
  const geminiId = "a1e2f3a4-b5c6-4789-a012-000000000002";

  const composerRow: ModelProfileConfig = {
    provider: "composer",
    model: "cursor-composer-2",
    temperature: 0.2,
    max_tokens: 8192,
    top_p: 1,
    cost_per_1k_in: 0.0005,
    cost_per_1k_out: 0.0025,
    max_cost_per_run: null,
    fallback_profile_id: geminiId,
  };

  const geminiRow: ModelProfileConfig = {
    provider: "gemini",
    model: "gemini-3-flash-preview",
    temperature: 1,
    max_tokens: 8192,
    top_p: 0.95,
    cost_per_1k_in: 0.0005,
    cost_per_1k_out: 0.003,
    max_cost_per_run: null,
    fallback_profile_id: null,
  };

  function mockSb(rows: Record<string, ModelProfileConfig | null>): SupabaseClient<Database> {
    return {
      from(table: string) {
        if (table !== "model_profiles") throw new Error(table);
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => ({ data: rows[id] ?? null }),
            }),
          }),
        };
      },
    } as unknown as SupabaseClient<Database>;
  }

  beforeEach(() => {
    resetLlmProviderCache();
    process.env.COMPOSER_API_KEY = "ck";
    process.env.GEMINI_API_KEY = "gk";
    process.env.COMPOSER_API_BASE_URL = "https://composer-chain.test/v1";
  });

  afterEach(() => {
    resetLlmProviderCache();
    vi.unstubAllGlobals();
    delete process.env.COMPOSER_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.COMPOSER_API_BASE_URL;
  });

  it("falls back to gemini when composer HTTP fails", async () => {
    vi.useFakeTimers();

    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("composer-chain.test") && url.includes("chat/completions")) {
          return new Response(JSON.stringify({ error: "unavailable" }), { status: 503 });
        }
        if (url.includes("generativelanguage.googleapis.com") && url.includes("generateContent")) {
          return Response.json({
            candidates: [{ content: { parts: [{ text: "fallback-body" }] } }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 200 },
          });
        }
        return new Response("nope", { status: 404 });
      }),
    );

    const sb = mockSb({
      [composerId]: composerRow,
      [geminiId]: geminiRow,
    });

    const promise = chatWithProfile(sb, composerId, [{ role: "user", content: "ping" }]);
    await vi.runAllTimersAsync();
    const res = await promise;

    expect(res.content).toBe("fallback-body");
    expect(res.profile_used).toBe("gemini/gemini-3-flash-preview");
    expect(res.cost_usd).toBeCloseTo((100 / 1000) * 0.0005 + (200 / 1000) * 0.003, 8);
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThanOrEqual(2);

    vi.useRealTimers();
  }, 10000);

  it("uses composer only when first profile succeeds", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        if (url.includes("composer-chain.test") && url.includes("chat/completions")) {
          return Response.json({
            choices: [{ message: { content: "primary" } }],
            model: "cursor-composer-2",
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          });
        }
        return new Response("unexpected", { status: 500 });
      }),
    );

    const sb = mockSb({
      [composerId]: composerRow,
      [geminiId]: geminiRow,
    });

    const res = await chatWithProfile(sb, composerId, [{ role: "user", content: "ping" }]);

    expect(res.content).toBe("primary");
    expect(res.profile_used).toBe("composer/cursor-composer-2");
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });
});
