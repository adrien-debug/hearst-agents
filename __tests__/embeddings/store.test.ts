/**
 * Embeddings store — upsert (vector serialization), search ranking via
 * fallback cosine côté JS quand la RPC `match_embeddings` est absente.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

const { embedText, getServerSupabase } = vi.hoisted(() => ({
  embedText: vi.fn(),
  getServerSupabase: vi.fn(),
}));

vi.mock("@/lib/embeddings/embed", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, embedText };
});

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase,
  requireServerSupabase: () => {
    const sb = getServerSupabase();
    if (!sb) throw new Error("no sb");
    return sb;
  },
}));

import {
  upsertEmbedding,
  searchEmbeddings,
} from "@/lib/embeddings/store";
import { EMBEDDING_DIM } from "@/lib/embeddings/embed";

const ORIGINAL_KEY = process.env.OPENAI_API_KEY;

function vec(seed: number): number[] {
  // Vecteur 1536-dim simple, varie sur seed.
  return Array.from({ length: EMBEDDING_DIM }, (_, i) =>
    Math.sin((i + 1) * seed) * 0.5,
  );
}

interface MockSb {
  upsert: ReturnType<typeof vi.fn>;
  select: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
  rows: Array<Record<string, unknown>>;
}

function makeSb(): MockSb {
  const m: MockSb = {
    upsert: vi.fn(async () => ({ error: null })),
    select: vi.fn(),
    rpc: vi.fn(async () => ({ data: null, error: { message: "no rpc" } })),
    rows: [],
  };

  return m;
}

function attach(m: MockSb): unknown {
  // Chainable builder mimic for the search fallback path.
  const chain = {
    select: () => chain,
    eq: () => chain,
    limit: async () => ({ data: m.rows, error: null }),
  } as Record<string, unknown>;

  return {
    from: () => ({
      upsert: m.upsert,
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: chain.limit,
          }),
        }),
      }),
    }),
    rpc: m.rpc,
  };
}

describe("embeddings/store", () => {
  beforeEach(() => {
    embedText.mockReset();
    getServerSupabase.mockReset();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = ORIGINAL_KEY;
    }
  });

  it("upsertEmbedding sérialise le vecteur en littéral pgvector", async () => {
    const m = makeSb();
    getServerSupabase.mockReturnValue(attach(m));
    embedText.mockResolvedValue(vec(1));

    const ok = await upsertEmbedding({
      userId: "u1",
      tenantId: "t1",
      sourceKind: "message",
      sourceId: "msg-1",
      textExcerpt: "hello world",
    });

    expect(ok).toBe(true);
    expect(m.upsert).toHaveBeenCalledTimes(1);
    const payload = m.upsert.mock.calls[0][0] as { embedding: string };
    expect(typeof payload.embedding).toBe("string");
    expect(payload.embedding.startsWith("[")).toBe(true);
    expect(payload.embedding.endsWith("]")).toBe(true);
  });

  it("upsertEmbedding fail-soft si Supabase absent", async () => {
    getServerSupabase.mockReturnValue(null);
    const ok = await upsertEmbedding({
      userId: "u1",
      tenantId: "t1",
      sourceKind: "message",
      sourceId: "msg-x",
      textExcerpt: "x",
    });
    expect(ok).toBe(false);
  });

  it("searchEmbeddings ranking par cosine en fallback (RPC down)", async () => {
    const m = makeSb();
    // Le query embed = vec(1), donc la row qui a vec(1) doit ranker en tête.
    m.rows = [
      {
        source_kind: "message",
        source_id: "far",
        text_excerpt: "far",
        embedding: `[${vec(50).join(",")}]`,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        source_kind: "message",
        source_id: "close",
        text_excerpt: "close",
        embedding: `[${vec(1).join(",")}]`,
        metadata: {},
        created_at: "2026-01-02T00:00:00Z",
      },
    ];
    getServerSupabase.mockReturnValue(attach(m));
    embedText.mockResolvedValue(vec(1));

    const results = await searchEmbeddings({
      userId: "u1",
      tenantId: "t1",
      queryText: "anything",
      k: 2,
    });
    expect(results).toHaveLength(2);
    expect(results[0].sourceId).toBe("close");
    expect(results[0].similarity).toBeGreaterThan(results[1].similarity);
  });

  it("searchEmbeddings filtre par sourceKinds", async () => {
    const m = makeSb();
    m.rows = [
      {
        source_kind: "asset",
        source_id: "asset-1",
        text_excerpt: "hello asset",
        embedding: `[${vec(1).join(",")}]`,
        metadata: {},
        created_at: "2026-01-01T00:00:00Z",
      },
      {
        source_kind: "message",
        source_id: "msg-1",
        text_excerpt: "hello msg",
        embedding: `[${vec(1).join(",")}]`,
        metadata: {},
        created_at: "2026-01-02T00:00:00Z",
      },
    ];
    getServerSupabase.mockReturnValue(attach(m));
    embedText.mockResolvedValue(vec(1));

    const results = await searchEmbeddings({
      userId: "u1",
      tenantId: "t1",
      queryText: "hello",
      sourceKinds: ["asset"],
    });
    expect(results.length).toBe(1);
    expect(results[0].sourceKind).toBe("asset");
  });

  it("searchEmbeddings retourne [] sans Supabase", async () => {
    getServerSupabase.mockReturnValue(null);
    const r = await searchEmbeddings({
      userId: "u1",
      tenantId: "t1",
      queryText: "x",
    });
    expect(r).toEqual([]);
  });

  it("searchEmbeddings utilise la RPC match_embeddings quand elle réussit", async () => {
    const m = makeSb();
    const rpcRows = [
      {
        id: "00000000-0000-0000-0000-000000000001",
        source_kind: "message",
        source_id: "msg-1",
        text_excerpt: "rpc-hit",
        metadata: { role: "user" },
        similarity: 0.92,
        created_at: "2026-04-30T00:00:00Z",
      },
      {
        id: "00000000-0000-0000-0000-000000000002",
        source_kind: "asset",
        source_id: "asset-1",
        text_excerpt: "rpc-asset",
        metadata: {},
        similarity: 0.81,
        created_at: "2026-04-30T00:00:01Z",
      },
    ];
    m.rpc = vi.fn(async () => ({ data: rpcRows, error: null }));
    getServerSupabase.mockReturnValue(attach(m));
    embedText.mockResolvedValue(vec(1));

    const results = await searchEmbeddings({
      userId: "u1",
      tenantId: "t1",
      queryText: "anything",
      k: 2,
      sourceKinds: ["message", "asset"],
    });

    expect(m.rpc).toHaveBeenCalledTimes(1);
    const [fnName, args] = m.rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(fnName).toBe("match_embeddings");
    expect(args.match_user_id).toBe("u1");
    expect(args.match_tenant_id).toBe("t1");
    expect(args.match_count).toBe(2);
    expect(args.source_kinds).toEqual(["message", "asset"]);
    expect(typeof args.query_embedding).toBe("string");
    expect((args.query_embedding as string).startsWith("[")).toBe(true);

    expect(results).toHaveLength(2);
    expect(results[0].sourceId).toBe("msg-1");
    expect(results[0].similarity).toBe(0.92);
    expect(results[0].sourceKind).toBe("message");
    expect(results[0].textExcerpt).toBe("rpc-hit");
    expect(results[1].sourceKind).toBe("asset");
  });

  it("searchEmbeddings fallback JS quand la RPC throw", async () => {
    const m = makeSb();
    m.rpc = vi.fn(async () => {
      throw new Error("rpc not installed");
    });
    m.rows = [
      {
        source_kind: "message",
        source_id: "fallback-row",
        text_excerpt: "from-fallback",
        embedding: `[${vec(1).join(",")}]`,
        metadata: {},
        created_at: "2026-04-30T00:00:00Z",
      },
    ];
    getServerSupabase.mockReturnValue(attach(m));
    embedText.mockResolvedValue(vec(1));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const results = await searchEmbeddings({
      userId: "u1",
      tenantId: "t1",
      queryText: "anything",
    });

    expect(m.rpc).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].sourceId).toBe("fallback-row");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("searchEmbeddings fallback JS quand la RPC retourne une erreur", async () => {
    const m = makeSb();
    m.rpc = vi.fn(async () => ({ data: null, error: { message: "no rpc" } }));
    m.rows = [
      {
        source_kind: "message",
        source_id: "err-fallback",
        text_excerpt: "txt",
        embedding: `[${vec(1).join(",")}]`,
        metadata: {},
        created_at: "2026-04-30T00:00:00Z",
      },
    ];
    getServerSupabase.mockReturnValue(attach(m));
    embedText.mockResolvedValue(vec(1));

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const results = await searchEmbeddings({
      userId: "u1",
      tenantId: "t1",
      queryText: "anything",
    });

    expect(results).toHaveLength(1);
    expect(results[0].sourceId).toBe("err-fallback");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
