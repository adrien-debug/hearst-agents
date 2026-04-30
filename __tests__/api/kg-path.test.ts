/**
 * GET /api/v2/kg/path — BFS bidirectionnel sur les edges du KG.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: { userId: "u1", tenantId: "t1", workspaceId: "w1", isDevFallback: false },
    error: null,
  })),
}));

const { getGraph } = vi.hoisted(() => ({ getGraph: vi.fn() }));

vi.mock("@/lib/memory/kg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getGraph };
});

import { GET } from "@/app/api/v2/kg/path/route";

function makeReq(params: Record<string, string>): {
  nextUrl: { searchParams: URLSearchParams };
} {
  const url = new URL("http://x/api/v2/kg/path");
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return { nextUrl: url } as unknown as { nextUrl: { searchParams: URLSearchParams } };
}

const node = (id: string, type = "person") => ({
  id,
  user_id: "u1",
  tenant_id: "t1",
  type,
  label: id,
  properties: {},
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-30T00:00:00Z",
});

const edge = (id: string, src: string, tgt: string, type = "related") => ({
  id,
  user_id: "u1",
  tenant_id: "t1",
  source_id: src,
  target_id: tgt,
  type,
  weight: 1.0,
  created_at: "2026-04-01T00:00:00Z",
});

describe("GET /api/v2/kg/path", () => {
  beforeEach(() => {
    getGraph.mockReset();
  });

  it("from manquant → 400", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq({ to: "B" }) as any);
    expect(res.status).toBe(400);
  });

  it("chemin direct A → B", async () => {
    getGraph.mockResolvedValue({
      nodes: [node("A"), node("B")],
      edges: [edge("e1", "A", "B")],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq({ from: "A", to: "B" }) as any);
    const body = await res.json();
    expect(body.path).not.toBeNull();
    expect(body.path.hops).toBe(1);
    expect(body.path.nodes.map((n: { id: string }) => n.id)).toEqual(["A", "B"]);
  });

  it("chemin via intermédiaire A → B → C", async () => {
    getGraph.mockResolvedValue({
      nodes: [node("A"), node("B"), node("C")],
      edges: [edge("e1", "A", "B"), edge("e2", "B", "C")],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq({ from: "A", to: "C" }) as any);
    const body = await res.json();
    expect(body.path.hops).toBe(2);
    expect(body.path.nodes.map((n: { id: string }) => n.id)).toEqual(["A", "B", "C"]);
  });

  it("aucun chemin → path: null", async () => {
    getGraph.mockResolvedValue({
      nodes: [node("A"), node("B"), node("C")],
      edges: [edge("e1", "A", "B")],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq({ from: "A", to: "C" }) as any);
    const body = await res.json();
    expect(body.path).toBeNull();
  });

  it("respecte maxHops", async () => {
    getGraph.mockResolvedValue({
      nodes: [node("A"), node("B"), node("C"), node("D")],
      edges: [edge("e1", "A", "B"), edge("e2", "B", "C"), edge("e3", "C", "D")],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq({ from: "A", to: "D", maxHops: "2" }) as any);
    const body = await res.json();
    expect(body.path).toBeNull();
  });

  it("from === to → path direct sans saut", async () => {
    getGraph.mockResolvedValue({
      nodes: [node("A")],
      edges: [],
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq({ from: "A", to: "A" }) as any);
    const body = await res.json();
    expect(body.path).not.toBeNull();
    expect(body.path.hops).toBe(0);
  });
});
