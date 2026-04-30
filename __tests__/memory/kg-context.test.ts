/**
 * kg-context — formats compact KG summary string + 60s memory cache.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const { getGraph } = vi.hoisted(() => ({ getGraph: vi.fn() }));

vi.mock("@/lib/memory/kg", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, getGraph };
});

import {
  getKgContextForUser,
  __clearKgContextCache,
} from "@/lib/memory/kg-context";
import type { KgEdge, KgNode } from "@/lib/memory/kg";

function makeNode(partial: Partial<KgNode> & { type: string; label: string }): KgNode {
  return {
    id: partial.id ?? `id-${Math.random()}`,
    user_id: partial.user_id ?? "u1",
    tenant_id: partial.tenant_id ?? "t1",
    type: partial.type,
    label: partial.label,
    properties: partial.properties ?? {},
    created_at: partial.created_at ?? "2026-04-01T00:00:00Z",
    updated_at: partial.updated_at ?? "2026-04-30T00:00:00Z",
  } as KgNode;
}

describe("getKgContextForUser", () => {
  beforeEach(() => {
    __clearKgContextCache();
    getGraph.mockReset();
  });

  it("retourne null si graph vide", async () => {
    getGraph.mockResolvedValue({ nodes: [], edges: [] as KgEdge[] });
    const ctx = await getKgContextForUser("u1", "t1", { bypassCache: true });
    expect(ctx).toBeNull();
  });

  it("formate par catégorie avec label en français", async () => {
    getGraph.mockResolvedValue({
      nodes: [
        makeNode({ type: "person", label: "Adrien", properties: { role: "founder" } }),
        makeNode({ type: "company", label: "ACME Corp" }),
        makeNode({ type: "project", label: "Hearst OS" }),
        makeNode({ type: "decision", label: "Migrer v2" }),
      ],
      edges: [],
    });
    const ctx = await getKgContextForUser("u1", "t1", { bypassCache: true });
    expect(ctx).not.toBeNull();
    expect(ctx).toContain("Personnes : Adrien (founder)");
    expect(ctx).toContain("Entreprises : ACME Corp");
    expect(ctx).toContain("Projets : Hearst OS");
    expect(ctx).toContain("Décisions : Migrer v2");
  });

  it("cap strict 1500 chars", async () => {
    const many: KgNode[] = [];
    for (let i = 0; i < 50; i++) {
      many.push(
        makeNode({
          type: "topic",
          label: `Sujet très long avec beaucoup de caractères ${i} ${"x".repeat(40)}`,
        }),
      );
    }
    getGraph.mockResolvedValue({ nodes: many, edges: [] });
    const ctx = await getKgContextForUser("u1", "t1", { bypassCache: true });
    expect(ctx).not.toBeNull();
    expect(ctx!.length).toBeLessThanOrEqual(1500);
  });

  it("cache hit pendant TTL — getGraph appelé une seule fois", async () => {
    getGraph.mockResolvedValue({
      nodes: [makeNode({ type: "person", label: "Bob" })],
      edges: [],
    });
    const a = await getKgContextForUser("u1", "t1");
    const b = await getKgContextForUser("u1", "t1");
    const c = await getKgContextForUser("u1", "t1");
    expect(a).toBe(b);
    expect(b).toBe(c);
    expect(getGraph).toHaveBeenCalledTimes(1);
  });

  it("bypassCache → ré-appelle getGraph à chaque call", async () => {
    getGraph.mockResolvedValue({
      nodes: [makeNode({ type: "person", label: "Bob" })],
      edges: [],
    });
    await getKgContextForUser("u1", "t1", { bypassCache: true });
    await getKgContextForUser("u1", "t1", { bypassCache: true });
    expect(getGraph).toHaveBeenCalledTimes(2);
  });

  it("getGraph throw → retourne null sans propager", async () => {
    getGraph.mockRejectedValue(new Error("supabase down"));
    const ctx = await getKgContextForUser("u1", "t1", { bypassCache: true });
    expect(ctx).toBeNull();
  });

  it("scope distinct → cache distinct par (userId, tenantId)", async () => {
    getGraph
      .mockResolvedValueOnce({
        nodes: [makeNode({ type: "person", label: "Adrien" })],
        edges: [],
      })
      .mockResolvedValueOnce({
        nodes: [makeNode({ type: "person", label: "Bob" })],
        edges: [],
      });
    const a = await getKgContextForUser("u1", "t1");
    const b = await getKgContextForUser("u2", "t1");
    expect(a).toContain("Adrien");
    expect(b).toContain("Bob");
    expect(getGraph).toHaveBeenCalledTimes(2);
  });
});
