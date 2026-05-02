/**
 * Tests pour query_knowledge_graph tool + runKgQuery helper.
 * Mock embeddings + supabase pour tester les 2 happy paths + edge case empty.
 */

import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/embeddings/store", () => ({
  searchEmbeddings: vi.fn(async (input: { queryText: string }) => {
    if (input.queryText.includes("inconnu")) return [];
    return [
      {
        sourceKind: "kg_node" as const,
        sourceId: "00000000-0000-4000-8000-000000000001",
        textExcerpt: "person: Alice — role: founder",
        similarity: 0.92,
        metadata: {},
        createdAt: "2026-05-01T10:00:00Z",
      },
      {
        sourceKind: "kg_node" as const,
        sourceId: "00000000-0000-4000-8000-000000000002",
        textExcerpt: "company: ACME Corp",
        similarity: 0.85,
        metadata: {},
        createdAt: "2026-05-01T10:00:00Z",
      },
    ];
  }),
}));

vi.mock("@/lib/platform/db/supabase", () => ({
  requireServerSupabase: () => ({
    from: vi.fn((table: string) => {
      const mockNodes = [
        {
          id: "00000000-0000-4000-8000-000000000001",
          user_id: "u",
          tenant_id: "t",
          type: "person",
          label: "Alice",
          properties: { role: "founder" },
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-01T10:00:00Z",
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          user_id: "u",
          tenant_id: "t",
          type: "company",
          label: "ACME Corp",
          properties: {},
          created_at: "2026-05-01T10:00:00Z",
          updated_at: "2026-05-01T10:00:00Z",
        },
      ];
      const mockEdges = [
        {
          id: "e1",
          user_id: "u",
          tenant_id: "t",
          source_id: "00000000-0000-4000-8000-000000000001",
          target_id: "00000000-0000-4000-8000-000000000002",
          type: "works_at",
          weight: 1.0,
          created_at: "2026-05-01T10:00:00Z",
        },
      ];

      const builder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue({
          data: table === "kg_nodes" ? mockNodes : mockEdges,
          error: null,
        }),
      };

      // For nodes, .in() should resolve directly (not need .limit())
      if (table === "kg_nodes") {
        return {
          ...builder,
          select: vi.fn(() => ({
            ...builder,
            eq: vi.fn(() => ({
              ...builder,
              eq: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ data: mockNodes, error: null }),
              })),
            })),
          })),
        };
      }
      return builder;
    }),
  }),
}));

describe("runKgQuery", () => {
  it("retourne nodes + edges sans narrative quand withNarrative=false", async () => {
    const { runKgQuery } = await import("@/lib/tools/native/kg-query");
    const result = await runKgQuery(
      { userId: "u", tenantId: "t" },
      { question: "qui est Alice", withNarrative: false },
    );
    expect(result.nodes.length).toBeGreaterThan(0);
    expect(result.narrative).toBeNull();
  });

  it("retourne empty result quand searchEmbeddings ne match rien", async () => {
    const { runKgQuery } = await import("@/lib/tools/native/kg-query");
    const result = await runKgQuery(
      { userId: "u", tenantId: "t" },
      { question: "sujet inconnu" },
    );
    expect(result.nodes).toEqual([]);
    expect(result.edges).toEqual([]);
    expect(result.narrative).toBeNull();
  });
});
