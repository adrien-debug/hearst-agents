/**
 * GET /api/v2/memory/search — auth + 503 si OPENAI absent +
 * forme du payload retourné.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { requireScope, searchEmbeddings, isEmbeddingsAvailable } = vi.hoisted(() => ({
  requireScope: vi.fn(),
  searchEmbeddings: vi.fn(),
  isEmbeddingsAvailable: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({ requireScope }));

vi.mock("@/lib/embeddings/embed", () => ({ isEmbeddingsAvailable }));

vi.mock("@/lib/embeddings/store", () => ({ searchEmbeddings }));

import { GET } from "@/app/api/v2/memory/search/route";

function makeReq(params: Record<string, string>): { nextUrl: { searchParams: URLSearchParams } } {
  const url = new URL("http://x/api/v2/memory/search");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as { nextUrl: { searchParams: URLSearchParams } };
}

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

describe("GET /api/v2/memory/search", () => {
  beforeEach(() => {
    requireScope.mockReset();
    searchEmbeddings.mockReset();
    isEmbeddingsAvailable.mockReset();
    requireScope.mockResolvedValue({
      scope: { userId: "u1", tenantId: "t1", workspaceId: "w1", isDevFallback: false },
      error: null,
    });
    isEmbeddingsAvailable.mockReturnValue(true);
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = ORIGINAL_KEY;
  });

  it("non authentifié → 401", async () => {
    requireScope.mockResolvedValueOnce({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const res = await GET(makeReq({ q: "foo" }) as never);
    expect(res.status).toBe(401);
  });

  it("OPENAI_API_KEY absent → 503", async () => {
    isEmbeddingsAvailable.mockReturnValue(false);
    const res = await GET(makeReq({ q: "x" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("embeddings_unavailable");
  });

  it("q vide → items: []", async () => {
    const res = await GET(makeReq({ q: "" }) as never);
    const body = await res.json();
    expect(body.items).toEqual([]);
    expect(searchEmbeddings).not.toHaveBeenCalled();
  });

  it("forme du payload : items[] avec sourceKind, similarity, …", async () => {
    searchEmbeddings.mockResolvedValue([
      {
        sourceKind: "message",
        sourceId: "m-1",
        textExcerpt: "hello",
        similarity: 0.91,
        metadata: { role: "user" },
        createdAt: "2026-04-30T00:00:00Z",
      },
    ]);
    const res = await GET(makeReq({ q: "hello", k: "5" }) as never);
    const body = await res.json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].sourceKind).toBe("message");
    expect(body.items[0].similarity).toBeCloseTo(0.91);
    expect(searchEmbeddings).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", tenantId: "t1", queryText: "hello", k: 5 }),
    );
  });

  it("kinds=message,asset → forwardé en sourceKinds", async () => {
    searchEmbeddings.mockResolvedValue([]);
    await GET(makeReq({ q: "hi", kinds: "message,asset,bogus" }) as never);
    const arg = searchEmbeddings.mock.calls[0][0] as { sourceKinds: string[] };
    expect(arg.sourceKinds).toEqual(["message", "asset"]);
  });

  it("k clamped entre 1 et 50", async () => {
    searchEmbeddings.mockResolvedValue([]);
    await GET(makeReq({ q: "hi", k: "999" }) as never);
    expect((searchEmbeddings.mock.calls[0][0] as { k: number }).k).toBe(50);
    searchEmbeddings.mockClear();
    await GET(makeReq({ q: "hi", k: "0" }) as never);
    expect((searchEmbeddings.mock.calls[0][0] as { k: number }).k).toBe(1);
  });

  it("searchEmbeddings throw → 500", async () => {
    searchEmbeddings.mockRejectedValue(new Error("boom"));
    const res = await GET(makeReq({ q: "x" }) as never);
    expect(res.status).toBe(500);
  });
});
