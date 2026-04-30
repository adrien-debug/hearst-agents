/**
 * GET /api/v2/kg/search — recherche fuzzy ILIKE + scoring.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "u1",
      tenantId: "t1",
      workspaceId: "w1",
      isDevFallback: false,
    },
    error: null,
  })),
}));

let mockSelectResult: { data: unknown[] | null; error: { message: string } | null } = {
  data: [],
  error: null,
};

const ilikeFn = vi.fn();
const limitFn = vi.fn(async () => mockSelectResult);

vi.mock("@/lib/platform/db/supabase", () => ({
  requireServerSupabase: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            ilike: (...args: unknown[]) => {
              ilikeFn(...args);
              return { limit: limitFn };
            },
          }),
        }),
      }),
    }),
  }),
}));

import { GET } from "@/app/api/v2/kg/search/route";

function makeReq(q: string | null): { nextUrl: { searchParams: URLSearchParams } } {
  const url = new URL("http://x/api/v2/kg/search");
  if (q !== null) url.searchParams.set("q", q);
  return { nextUrl: url } as unknown as { nextUrl: { searchParams: URLSearchParams } };
}

describe("GET /api/v2/kg/search", () => {
  beforeEach(() => {
    mockSelectResult = { data: [], error: null };
    ilikeFn.mockReset();
    limitFn.mockClear();
  });

  it("q vide → renvoie nodes vides sans hit DB", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq("") as any);
    const body = await res.json();
    expect(body.nodes).toEqual([]);
  });

  it("q présent → ILIKE %escaped% + tri par relevance", async () => {
    mockSelectResult = {
      data: [
        {
          id: "n1",
          user_id: "u1",
          tenant_id: "t1",
          type: "company",
          label: "ACME Corp",
          properties: {},
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-30T00:00:00Z",
        },
        {
          id: "n2",
          user_id: "u1",
          tenant_id: "t1",
          type: "project",
          label: "ACME",
          properties: {},
          created_at: "2026-04-01T00:00:00Z",
          updated_at: "2026-04-30T00:00:00Z",
        },
      ],
      error: null,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq("ACME") as any);
    const body = await res.json();
    expect(body.nodes).toHaveLength(2);
    // exact match en premier
    expect(body.nodes[0].label).toBe("ACME");
    expect(body.nodes[0].relevance).toBe(1.0);
    expect(body.nodes[1].relevance).toBeLessThan(1.0);
    expect(ilikeFn).toHaveBeenCalledWith("label", "%ACME%");
  });

  it("DB error → 500", async () => {
    mockSelectResult = { data: null, error: { message: "boom" } };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = await GET(makeReq("foo") as any);
    expect(res.status).toBe(500);
  });
});
