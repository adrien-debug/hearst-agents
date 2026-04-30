/**
 * retrieval-context — formatRetrievedItems + cap 1500 chars + cache 30s.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { searchEmbeddings } = vi.hoisted(() => ({
  searchEmbeddings: vi.fn(),
}));

vi.mock("@/lib/embeddings/store", () => ({
  searchEmbeddings,
}));

import {
  getRetrievedMemoryForUser,
  formatRetrievedItems,
  __clearRetrievalCache,
} from "@/lib/memory/retrieval-context";
import type { RetrievedEmbedding } from "@/lib/embeddings/store";

function item(p: Partial<RetrievedEmbedding> & { textExcerpt: string }): RetrievedEmbedding {
  return {
    sourceKind: p.sourceKind ?? "message",
    sourceId: p.sourceId ?? "x",
    textExcerpt: p.textExcerpt,
    similarity: p.similarity ?? 0.9,
    metadata: p.metadata ?? {},
    createdAt: p.createdAt ?? "2026-04-30T00:00:00Z",
  };
}

describe("formatRetrievedItems", () => {
  it("vide → string vide", () => {
    expect(formatRetrievedItems([])).toBe("");
  });

  it("formate avec préfixe label par kind", () => {
    const out = formatRetrievedItems([
      item({ sourceKind: "message", textExcerpt: "Adrien parlait pricing" }),
      item({ sourceKind: "asset", textExcerpt: "Plan Q2 — sections" }),
    ]);
    expect(out).toContain("[message] Adrien parlait pricing");
    expect(out).toContain("[asset] Plan Q2 — sections");
    expect(out).toMatch(/Souvenirs pertinents/);
  });

  it("ordonne par similarité décroissante", () => {
    const out = formatRetrievedItems([
      item({ textExcerpt: "low", similarity: 0.1 }),
      item({ textExcerpt: "high", similarity: 0.9 }),
    ]);
    const lowIdx = out.indexOf("low");
    const highIdx = out.indexOf("high");
    expect(highIdx).toBeLessThan(lowIdx);
  });

  it("cap 1500 chars total", () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      item({ textExcerpt: `excerpt ${i} ${"x".repeat(200)}`, similarity: 1 - i * 0.01 }),
    );
    const out = formatRetrievedItems(many);
    expect(out.length).toBeLessThanOrEqual(1500);
  });
});

describe("getRetrievedMemoryForUser", () => {
  beforeEach(() => {
    __clearRetrievalCache();
    searchEmbeddings.mockReset();
  });

  it("retourne string vide si message absent", async () => {
    const out = await getRetrievedMemoryForUser({
      userId: "u1",
      tenantId: "t1",
      currentMessage: "   ",
    });
    expect(out).toBe("");
    expect(searchEmbeddings).not.toHaveBeenCalled();
  });

  it("appelle searchEmbeddings et formate", async () => {
    searchEmbeddings.mockResolvedValue([
      item({ sourceKind: "message", textExcerpt: "hier on parlait de pricing", similarity: 0.95 }),
    ]);
    const out = await getRetrievedMemoryForUser({
      userId: "u1",
      tenantId: "t1",
      currentMessage: "et hier on parlait de quoi ?",
    });
    expect(out).toContain("Souvenirs pertinents");
    expect(out).toContain("hier on parlait de pricing");
    expect(searchEmbeddings).toHaveBeenCalledTimes(1);
  });

  it("cache hit pendant TTL — searchEmbeddings appelé une seule fois", async () => {
    searchEmbeddings.mockResolvedValue([
      item({ textExcerpt: "doc important" }),
    ]);
    const a = await getRetrievedMemoryForUser({
      userId: "u1",
      tenantId: "t1",
      currentMessage: "même requête",
    });
    const b = await getRetrievedMemoryForUser({
      userId: "u1",
      tenantId: "t1",
      currentMessage: "même requête",
    });
    expect(a).toBe(b);
    expect(searchEmbeddings).toHaveBeenCalledTimes(1);
  });

  it("scope distinct → cache distinct", async () => {
    searchEmbeddings
      .mockResolvedValueOnce([item({ textExcerpt: "u1 mem" })])
      .mockResolvedValueOnce([item({ textExcerpt: "u2 mem" })]);
    const a = await getRetrievedMemoryForUser({
      userId: "u1",
      tenantId: "t1",
      currentMessage: "x",
    });
    const b = await getRetrievedMemoryForUser({
      userId: "u2",
      tenantId: "t1",
      currentMessage: "x",
    });
    expect(a).toContain("u1 mem");
    expect(b).toContain("u2 mem");
    expect(searchEmbeddings).toHaveBeenCalledTimes(2);
  });

  it("searchEmbeddings throw → fail-soft string vide", async () => {
    searchEmbeddings.mockRejectedValue(new Error("supabase down"));
    const out = await getRetrievedMemoryForUser({
      userId: "u1",
      tenantId: "t1",
      currentMessage: "anything",
    });
    expect(out).toBe("");
  });
});
