/**
 * GET /api/v2/usage/today — agrégation cost_usd des runs du jour + budget.
 *
 * Mock requireScope (auth) et requireServerSupabase (DB) pour rester
 * unit-test pur (pas de réseau, pas de Supabase live).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock auth — toujours autoriser un user de test
vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "user-test",
      tenantId: "tenant-test",
      workspaceId: "ws-test",
      isDevFallback: false,
    },
    error: null,
  })),
}));

// Le mock supabase change selon le test : on prépare un setter.
let mockRunsResult: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

vi.mock("@/lib/platform/db/supabase", () => ({
  requireServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          gte: async () => mockRunsResult,
        }),
      }),
    }),
  }),
}));

describe("GET /api/v2/usage/today", () => {
  beforeEach(() => {
    mockRunsResult = { data: [], error: null };
  });

  it("retourne zéros + budget par défaut quand aucun run", async () => {
    const { GET } = await import("@/app/api/v2/usage/today/route");
    const res = await GET();
    const body = await res.json();
    expect(body.usedUSD).toBe(0);
    expect(body.runs).toBe(0);
    expect(body.budgetUSD).toBeGreaterThan(0);
    expect(body.windowStart).toMatch(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/);
  });

  it("agrège cost_usd des runs", async () => {
    mockRunsResult = {
      data: [
        { cost_usd: 0.12 },
        { cost_usd: 0.34 },
        { cost_usd: null },
        { cost_usd: 1.5 },
      ],
      error: null,
    };
    const { GET } = await import("@/app/api/v2/usage/today/route");
    const res = await GET();
    const body = await res.json();
    expect(body.usedUSD).toBe(1.96);
    expect(body.runs).toBe(4);
  });

  it("fail-soft : DB error → renvoie zéros sans crasher", async () => {
    mockRunsResult = { data: null, error: { message: "boom" } };
    const { GET } = await import("@/app/api/v2/usage/today/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.usedUSD).toBe(0);
    expect(body.runs).toBe(0);
  });
});
