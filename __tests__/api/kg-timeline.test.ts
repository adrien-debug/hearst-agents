/**
 * GET /api/v2/kg/timeline — vérifie :
 *  - 400 si entityId absent
 *  - 400 si entityId non-UUID (pas de propagation d'erreur Postgres brute)
 *  - 200 si entityId UUID valide (même si zero edge → events vide)
 *  - 500 ne propage pas le message Postgres brut au client
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  requireServerSupabase: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({ requireScope: mocks.requireScope }));
vi.mock("@/lib/platform/db/supabase", () => ({
  requireServerSupabase: mocks.requireServerSupabase,
}));

import { GET } from "@/app/api/v2/kg/timeline/route";

function makeReq(qs: Record<string, string>): unknown {
  const url = new URL("http://localhost/api/v2/kg/timeline");
  for (const [k, v] of Object.entries(qs)) url.searchParams.set(k, v);
  return { nextUrl: url };
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

const SCOPE = {
  scope: { userId: "u1", tenantId: "t1", workspaceId: "w1", isDevFallback: false },
  error: null,
};

describe("GET /api/v2/kg/timeline", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireScope.mockResolvedValue(SCOPE);
  });

  it("400 quand entityId absent", async () => {
    const res = await GET(makeReq({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("entityId_required");
  });

  it("400 quand entityId non-UUID (pas de fuite Postgres)", async () => {
    const res = await GET(makeReq({ entityId: "not-a-uuid" }) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_entity_id");
    expect(body.message).toMatch(/UUID/i);
    // Crucial : Supabase ne doit pas avoir été interrogé.
    expect(mocks.requireServerSupabase).not.toHaveBeenCalled();
  });

  it("200 quand entityId UUID valide + zero edge → events vide", async () => {
    mocks.requireServerSupabase.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    } as never);

    const res = await GET(makeReq({ entityId: VALID_UUID }) as never);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.events).toEqual([]);
  });

  it("500 sans propager le message Postgres brut", async () => {
    mocks.requireServerSupabase.mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({
                data: null,
                error: {
                  message: "invalid input syntax for type uuid: \"x\" CONTEXT: SQL function...",
                },
              }),
            }),
          }),
        }),
      }),
    } as never);

    const res = await GET(makeReq({ entityId: VALID_UUID }) as never);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toBe("timeline_failed");
    // Le message ne doit PAS contenir le détail Postgres.
    expect(body.message).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("CONTEXT:");
    expect(JSON.stringify(body)).not.toContain("invalid input syntax");
  });
});
