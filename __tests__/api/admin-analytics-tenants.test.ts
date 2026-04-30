/**
 * Tests — endpoint /api/admin/analytics/tenants.
 *
 * Symétrique à admin-analytics-usage.test.ts : valide le contrat auth
 * (401 / 403 / 200) et les deux modes de réponse (top tenants vs drill-down
 * `?tenantId=`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Empêche le module aggregate.ts de toucher Supabase réel — on contrôle les
// fixtures via des mocks sur ses fonctions exportées plus bas.
vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: vi.fn(() => null),
  requireServerSupabase: vi.fn(() => {
    throw new Error("not used");
  }),
}));

// Mock requireAdmin pour simuler les trois cas (autorisé / 401 / 403).
const allowGuard = {
  scope: { userId: "admin-user", tenantId: "t", workspaceId: "w" },
  db: {} as never,
};
const denyGuard403 = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });
const denyGuard401 = new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });

vi.mock("@/app/api/admin/_helpers", () => ({
  requireAdmin: vi.fn(),
  isError: (v: unknown) => v instanceof Response,
}));

// Mock des fonctions d'agrégation pour ne pas dépendre de Supabase.
vi.mock("@/lib/admin/usage/aggregate", async () => {
  const actual = await vi.importActual<typeof import("@/lib/admin/usage/aggregate")>(
    "@/lib/admin/usage/aggregate",
  );
  return {
    ...actual,
    getTopTenants: vi.fn(async () => [
      {
        tenantId: "tenant-A",
        totalRuns: 10,
        totalCostUsd: 1.5,
        totalTokensIn: 1000,
        totalTokensOut: 500,
        totalMissions: 2,
        totalAssets: 4,
        activeUsers: 3,
      },
      {
        tenantId: "tenant-B",
        totalRuns: 4,
        totalCostUsd: 0.5,
        totalTokensIn: 200,
        totalTokensOut: 100,
        totalMissions: 1,
        totalAssets: 1,
        activeUsers: 1,
      },
    ]),
    getTenantUsage: vi.fn(async (tenantId: string) => ({
      tenantId,
      totalRuns: 10,
      totalCostUsd: 1.5,
      totalTokensIn: 1000,
      totalTokensOut: 500,
      totalMissions: 2,
      totalAssets: 4,
      activeUsers: 3,
      users: [
        { userId: "u-1", runs: 6, costUsd: 1.0 },
        { userId: "u-2", runs: 4, costUsd: 0.5 },
      ],
    })),
  };
});

describe("GET /api/admin/analytics/tenants", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie 401 quand requireAdmin renvoie unauthorized", async () => {
    const helpers = await import("@/app/api/admin/_helpers");
    (helpers.requireAdmin as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(denyGuard401);

    const { GET } = await import("@/app/api/admin/analytics/tenants/route");
    const req = new Request("http://t/api/admin/analytics/tenants");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(401);
  });

  it("renvoie 403 quand requireAdmin refuse (user non-admin)", async () => {
    const helpers = await import("@/app/api/admin/_helpers");
    (helpers.requireAdmin as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(denyGuard403);

    const { GET } = await import("@/app/api/admin/analytics/tenants/route");
    const req = new Request("http://t/api/admin/analytics/tenants");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(403);
  });

  it("renvoie 200 + top tenants triés quand l'admin est autorisé", async () => {
    const helpers = await import("@/app/api/admin/_helpers");
    (helpers.requireAdmin as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(allowGuard);

    const { GET } = await import("@/app/api/admin/analytics/tenants/route");
    const req = new Request(
      "http://t/api/admin/analytics/tenants?start=2026-04-01T00:00:00.000Z&end=2026-04-30T00:00:00.000Z",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      range: { start: string; end: string };
      top: Array<{ tenantId: string; totalCostUsd: number }>;
    };
    expect(body.top).toHaveLength(2);
    expect(body.top[0].tenantId).toBe("tenant-A");
    expect(body.top[0].totalCostUsd).toBeGreaterThan(body.top[1].totalCostUsd);
  });

  it("renvoie 200 + drill-down user-by-user avec ?tenantId=", async () => {
    const helpers = await import("@/app/api/admin/_helpers");
    (helpers.requireAdmin as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(allowGuard);

    const { GET } = await import("@/app/api/admin/analytics/tenants/route");
    const req = new Request(
      "http://t/api/admin/analytics/tenants?tenantId=tenant-A",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      tenant: {
        tenantId: string;
        users: Array<{ userId: string; runs: number; costUsd: number }>;
      };
    };
    expect(body.tenant.tenantId).toBe("tenant-A");
    expect(body.tenant.users).toHaveLength(2);
    expect(body.tenant.users[0].userId).toBe("u-1");
  });
});
