import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import type { ModelProfileConfig } from "../../lib/llm/types";
import { getProvider, loadFallbackChain } from "../../lib/llm/router";
import { ComposerProvider } from "../../lib/llm/composer";
import { GeminiProvider } from "../../lib/llm/gemini";

describe("getProvider", () => {
  it('returns ComposerProvider for "composer"', () => {
    const p = getProvider("composer");
    expect(p).toBeInstanceOf(ComposerProvider);
    expect(p.name).toBe("composer");
  });

  it("normalizes provider name to lowercase", () => {
    expect(getProvider("COMPOSER").name).toBe("composer");
    expect(getProvider("Gemini").name).toBe("gemini");
  });

  it('returns GeminiProvider for "gemini"', () => {
    const p = getProvider("gemini");
    expect(p).toBeInstanceOf(GeminiProvider);
    expect(p.name).toBe("gemini");
  });

  it("returns singleton per provider key", () => {
    expect(getProvider("gemini")).toBe(getProvider("gemini"));
  });
});

describe("loadFallbackChain with composer → gemini profiles", () => {
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
        if (table !== "model_profiles") {
          throw new Error(`unexpected table ${table}`);
        }
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

  it("builds composer then gemini when fallback_profile_id links them", async () => {
    const sb = mockSb({
      [composerId]: composerRow,
      [geminiId]: geminiRow,
    });

    const chain = await loadFallbackChain(sb, composerId, 5);

    expect(chain).toHaveLength(2);
    expect(chain[0]!.provider).toBe("composer");
    expect(chain[0]!.model).toBe("cursor-composer-2");
    expect(chain[1]!.provider).toBe("gemini");
    expect(chain[1]!.model).toBe("gemini-3-flash-preview");
    expect(getProvider(chain[0]!.provider).name).toBe("composer");
    expect(getProvider(chain[1]!.provider).name).toBe("gemini");
  });

  it("stops at null fallback_profile_id", async () => {
    const sb = mockSb({
      [geminiId]: geminiRow,
    });
    const chain = await loadFallbackChain(sb, geminiId, 5);
    expect(chain).toHaveLength(1);
    expect(chain[0]!.provider).toBe("gemini");
  });

  it("respects maxDepth", async () => {
    const a = "00000000-0000-4000-8000-0000000000a1";
    const b = "00000000-0000-4000-8000-0000000000b2";
    const c = "00000000-0000-4000-8000-0000000000c3";

    const rowA: ModelProfileConfig = {
      ...composerRow,
      provider: "composer",
      model: "m-a",
      fallback_profile_id: b,
    };
    const rowB: ModelProfileConfig = {
      ...composerRow,
      provider: "gemini",
      model: "m-b",
      fallback_profile_id: c,
    };
    const rowC: ModelProfileConfig = {
      ...geminiRow,
      provider: "openai",
      model: "m-c",
      fallback_profile_id: null,
    };

    const sb = mockSb({
      [a]: rowA,
      [b]: rowB,
      [c]: rowC,
    });

    const chain = await loadFallbackChain(sb, a, 2);
    expect(chain).toHaveLength(2);
    expect(chain[0]!.model).toBe("m-a");
    expect(chain[1]!.model).toBe("m-b");
  });
});
