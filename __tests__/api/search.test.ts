/**
 * GET /api/v2/search — endpoint agrégé pour le Commandeur.
 *
 * Mock requireScope (auth) + getServerSupabase + searchEmbeddings. On
 * contrôle ce que chaque `from(table)` retourne pour valider le shape
 * de la réponse, le scope filter sur assets (provenance.userId), le
 * fail-soft, et le mode hybride (lexical+sémantique) avec le header
 * `X-Search-Mode`.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { requireScope, getServerSupabase, searchEmbeddings, isEmbeddingsAvailable } =
  vi.hoisted(() => ({
    requireScope: vi.fn(),
    getServerSupabase: vi.fn(),
    searchEmbeddings: vi.fn(),
    isEmbeddingsAvailable: vi.fn(),
  }));

vi.mock("@/lib/platform/auth/scope", () => ({ requireScope }));
vi.mock("@/lib/platform/db/supabase", () => ({ getServerSupabase }));
vi.mock("@/lib/embeddings/store", () => ({ searchEmbeddings }));
vi.mock("@/lib/embeddings/embed", () => ({ isEmbeddingsAvailable }));

import { GET } from "@/app/api/v2/search/route";

const SCOPE = {
  userId: "user-1",
  tenantId: "t-1",
  workspaceId: "w-1",
  isDevFallback: false,
};

interface TableResult {
  data: unknown[] | null;
  error: { message: string } | null;
}

function makeDb(
  tables: Record<string, TableResult>,
  inTables?: Record<string, TableResult>,
) {
  return {
    from: (tableName: string) => {
      const result = tables[tableName] ?? { data: [], error: null };
      const inResult = inTables?.[tableName] ?? result;
      // Builder qui implémente .ilike, .eq, .order, .limit, .in et est awaitable
      const builder: Record<string, unknown> = {};
      const chainMethods = ["ilike", "eq", "order", "select"];
      for (const m of chainMethods) {
        builder[m] = () => builder;
      }
      builder.limit = () => Promise.resolve(result);
      // .in() termine la chaîne et résout immédiatement (await direct)
      builder.in = () => Promise.resolve(inResult);
      builder.then = (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onFulfilled: (v: TableResult) => any,
        onRejected?: (e: unknown) => unknown,
      ) =>
        Promise.resolve(result).then(onFulfilled, onRejected);
      return builder;
    },
  };
}

function makeReq(qs: string): Request {
  return new Request(`http://localhost/api/v2/search?${qs}`, { method: "GET" });
}

describe("GET /api/v2/search", () => {
  beforeEach(() => {
    requireScope.mockReset();
    getServerSupabase.mockReset();
    searchEmbeddings.mockReset();
    isEmbeddingsAvailable.mockReset();
    requireScope.mockResolvedValue({ scope: SCOPE, error: null });
    // Par défaut, pas d'OpenAI key → mode lexical pur.
    isEmbeddingsAvailable.mockReturnValue(false);
    searchEmbeddings.mockResolvedValue([]);
  });

  it("401 si auth échoue", async () => {
    requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(401);
  });

  it("400 si q manquant", async () => {
    const res = await GET(makeReq("") as never);
    expect(res.status).toBe(400);
  });

  it("retourne shape vide quand pas de Supabase", async () => {
    getServerSupabase.mockReturnValue(null);
    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      assets: [],
      threads: [],
      missions: [],
      runs: [],
      kgNodes: [],
    });
  });

  it("agrège les résultats par section + filtre assets par provenance.userId", async () => {
    getServerSupabase.mockReturnValue(
      makeDb({
        assets: {
          data: [
            {
              id: "a1",
              title: "Rapport hello",
              kind: "report",
              provenance: { userId: "user-1", tenantId: "t-1" },
            },
            {
              id: "a2",
              title: "Rapport autre user",
              kind: "report",
              provenance: { userId: "user-2", tenantId: "t-1" },
            },
          ],
          error: null,
        },
        chat_messages: {
          data: [
            { conversation_id: "c1", content: "hello world", created_at: "2026-04-30T00:00:00Z" },
            { conversation_id: "c1", content: "hello again", created_at: "2026-04-30T00:00:01Z" },
            { conversation_id: "c2", content: "another hello", created_at: "2026-04-30T00:00:02Z" },
          ],
          error: null,
        },
        missions: {
          data: [{ id: "m1", title: "Mission hello", status: "running" }],
          error: null,
        },
        runs: {
          data: [{ id: "r1", entrypoint: "hello-pipeline", created_at: "2026-04-30T00:00:00Z" }],
          error: null,
        },
        kg_nodes: {
          data: [{ id: "k1", label: "Hello node", type: "entity" }],
          error: null,
        },
      }),
    );

    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.assets).toHaveLength(1);
    expect(body.assets[0].id).toBe("a1");
    expect(body.threads).toHaveLength(2);
    expect(body.threads.map((t: { id: string }) => t.id)).toEqual(["c1", "c2"]);
    expect(body.missions).toHaveLength(1);
    expect(body.runs).toHaveLength(1);
    expect(body.kgNodes).toHaveLength(1);
  });

  it("fail-soft : une source qui throw retourne tableau vide pour cette section", async () => {
    getServerSupabase.mockReturnValue({
      from: (tableName: string) => {
        if (tableName === "kg_nodes") {
          // Simule une table inexistante / erreur DB
          const builder: Record<string, unknown> = {};
          const chain = ["ilike", "eq", "order", "select"];
          for (const m of chain) builder[m] = () => builder;
          builder.limit = () =>
            Promise.resolve({ data: null, error: { message: "table not found" } });
          builder.then = (
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onFulfilled: (v: { data: null; error: { message: string } }) => any,
            onRejected?: (e: unknown) => unknown,
          ) =>
            Promise.resolve({ data: null, error: { message: "table not found" } }).then(
              onFulfilled,
              onRejected,
            );
          return builder;
        }
        // Autres tables OK avec data vide
        const builder: Record<string, unknown> = {};
        const chain = ["ilike", "eq", "order", "select"];
        for (const m of chain) builder[m] = () => builder;
        builder.limit = () => Promise.resolve({ data: [], error: null });
        builder.then = (
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          onFulfilled: (v: { data: never[]; error: null }) => any,
          onRejected?: (e: unknown) => unknown,
        ) => Promise.resolve({ data: [], error: null }).then(onFulfilled, onRejected);
        return builder;
      },
    });

    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kgNodes).toEqual([]);
    expect(body.assets).toEqual([]);
  });

  it("sans OPENAI_API_KEY → mode lexical, header X-Search-Mode: lexical", async () => {
    isEmbeddingsAvailable.mockReturnValue(false);
    getServerSupabase.mockReturnValue(
      makeDb({
        assets: { data: [], error: null },
        chat_messages: { data: [], error: null },
        missions: { data: [], error: null },
        runs: { data: [], error: null },
        kg_nodes: { data: [], error: null },
      }),
    );

    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-search-mode")).toBe("lexical");
    expect(searchEmbeddings).not.toHaveBeenCalled();
  });

  it("avec OPENAI_API_KEY mock → embeddings appelé pour assets/threads, header hybrid + fusion", async () => {
    isEmbeddingsAvailable.mockReturnValue(true);
    searchEmbeddings.mockResolvedValue([
      {
        sourceKind: "asset",
        sourceId: "asset-sem",
        textExcerpt: "summary sémantique",
        similarity: 0.91,
        metadata: { title: "Asset sémantique" },
        createdAt: "2026-04-30T00:00:00Z",
      },
      {
        sourceKind: "message",
        sourceId: "conv-sem:1700000000:user",
        textExcerpt: "discussion sémantique pertinente",
        similarity: 0.88,
        metadata: { conversationId: "conv-sem", role: "user" },
        createdAt: "2026-04-30T00:00:01Z",
      },
    ]);

    getServerSupabase.mockReturnValue(
      makeDb(
        {
          assets: {
            data: [
              {
                id: "asset-lex",
                title: "Rapport hello",
                kind: "report",
                provenance: { userId: "user-1", tenantId: "t-1" },
              },
            ],
            error: null,
          },
          chat_messages: {
            data: [
              {
                conversation_id: "conv-lex",
                content: "hello world lexical",
                created_at: "2026-04-30T00:00:00Z",
              },
            ],
            error: null,
          },
          missions: { data: [], error: null },
          runs: { data: [], error: null },
          kg_nodes: { data: [], error: null },
        },
        // .in("id", [...]) sur la table assets pour enrichir les hits sémantiques
        {
          assets: {
            data: [{ id: "asset-sem", title: "Asset sémantique", kind: "report" }],
            error: null,
          },
        },
      ),
    );

    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(200);
    expect(res.headers.get("x-search-mode")).toBe("hybrid");

    expect(searchEmbeddings).toHaveBeenCalledTimes(1);
    const arg = searchEmbeddings.mock.calls[0][0] as {
      userId: string;
      tenantId: string;
      sourceKinds: string[];
      queryText: string;
    };
    expect(arg.userId).toBe("user-1");
    expect(arg.tenantId).toBe("t-1");
    expect(arg.sourceKinds).toEqual(["asset", "message"]);
    expect(arg.queryText).toBe("hello");

    const body = await res.json();
    // Sémantique prioritaire → asset-sem doit être devant asset-lex
    const assetIds = body.assets.map((a: { id: string }) => a.id);
    expect(assetIds[0]).toBe("asset-sem");
    expect(assetIds).toContain("asset-lex");

    // Threads : le hit sémantique conv-sem doit être devant conv-lex
    const threadIds = body.threads.map((t: { id: string }) => t.id);
    expect(threadIds[0]).toBe("conv-sem");
    expect(threadIds).toContain("conv-lex");
  });

  it("embeddings throw → fallback ILIKE silencieux, header lexical", async () => {
    isEmbeddingsAvailable.mockReturnValue(true);
    searchEmbeddings.mockRejectedValue(new Error("embeddings down"));
    getServerSupabase.mockReturnValue(
      makeDb({
        assets: {
          data: [
            {
              id: "asset-lex",
              title: "Rapport hello",
              kind: "report",
              provenance: { userId: "user-1", tenantId: "t-1" },
            },
          ],
          error: null,
        },
        chat_messages: { data: [], error: null },
        missions: { data: [], error: null },
        runs: { data: [], error: null },
        kg_nodes: { data: [], error: null },
      }),
    );

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const res = await GET(makeReq("q=hello") as never);
    expect(res.status).toBe(200);
    // semantic est vide après catch → mode reste lexical
    expect(res.headers.get("x-search-mode")).toBe("lexical");
    const body = await res.json();
    expect(body.assets).toHaveLength(1);
    expect(body.assets[0].id).toBe("asset-lex");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
