/**
 * Tests — endpoints CRUD personas (`GET / POST` + `[id]` PATCH/DELETE).
 *
 * Stratégie : mock requireScope + getServerSupabase (null) → on vérifie au
 * moins le contrat (auth, validation 400, fallback builtins via store).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

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

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: vi.fn(() => null),
}));

describe("GET /api/v2/personas", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renvoie la liste des personas (fallback builtins)", async () => {
    const { GET } = await import("@/app/api/v2/personas/route");
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { personas: Array<{ id: string }> };
    expect(Array.isArray(body.personas)).toBe(true);
    expect(body.personas.length).toBeGreaterThan(0);
    expect(body.personas[0]).toHaveProperty("id");
  });
});

describe("POST /api/v2/personas (validation)", () => {
  it("retourne 400 si name absent", async () => {
    const { POST } = await import("@/app/api/v2/personas/route");
    const req = new Request("http://t/api/v2/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ description: "no name" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("retourne 500 quand DB indispo et name fourni", async () => {
    // Sans DB, createPersona throw → route renvoie 500 mais le contrat 400
    // ne s'applique pas → on accepte 500 ici, vérifie qu'on n'a pas 200.
    const { POST } = await import("@/app/api/v2/personas/route");
    const req = new Request("http://t/api/v2/personas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "Test", tone: "direct" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBeGreaterThanOrEqual(500);
  });
});

describe("DELETE /api/v2/personas/[id] (builtin protégé)", () => {
  it("refuse de supprimer un builtin", async () => {
    const { DELETE } = await import("@/app/api/v2/personas/[id]/route");
    const req = new Request("http://t/api/v2/personas/builtin:default", {
      method: "DELETE",
    });
    const ctx = { params: Promise.resolve({ id: "builtin:default" }) };
    const res = await DELETE(
      req as unknown as import("next/server").NextRequest,
      ctx,
    );
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("builtin_immutable");
  });
});
