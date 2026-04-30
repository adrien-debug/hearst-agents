/**
 * Tests — endpoint /api/admin/analytics/usage.
 *
 * Auth admin requise → on mock requireAdmin pour vérifier le contrat
 * (authorisé / refusé) et le payload.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Empêche le store admin de toucher Supabase réel
vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: vi.fn(() => null),
  requireServerSupabase: vi.fn(() => {
    throw new Error("not used");
  }),
}));

// Mock requireAdmin pour les deux cas (autorisé / refusé)
const allowGuard = {
  scope: { userId: "admin-user", tenantId: "t", workspaceId: "w" },
  db: {} as never,
};
const denyGuard = new Response(JSON.stringify({ error: "forbidden" }), { status: 403 });

vi.mock("@/app/api/admin/_helpers", () => ({
  requireAdmin: vi.fn(),
  isError: (v: unknown) => v instanceof Response,
}));

describe("GET /api/admin/analytics/usage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie 200 + payload quand l'admin est autorisé", async () => {
    const helpers = await import("@/app/api/admin/_helpers");
    (helpers.requireAdmin as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(allowGuard);

    const { GET } = await import("@/app/api/admin/analytics/usage/route");
    const req = new Request(
      "http://t/api/admin/analytics/usage?start=2026-04-01T00:00:00.000Z&end=2026-04-30T00:00:00.000Z&granularity=day",
    );
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      overview: { totalRuns: number };
      timeSeries: Array<unknown>;
    };
    expect(body.overview).toHaveProperty("totalRuns");
    expect(Array.isArray(body.timeSeries)).toBe(true);
  });

  it("renvoie 403 quand requireAdmin refuse", async () => {
    const helpers = await import("@/app/api/admin/_helpers");
    (helpers.requireAdmin as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(denyGuard);

    const { GET } = await import("@/app/api/admin/analytics/usage/route");
    const req = new Request("http://t/api/admin/analytics/usage");
    const res = await GET(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(403);
  });
});
