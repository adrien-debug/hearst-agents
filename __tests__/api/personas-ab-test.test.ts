/**
 * Tests — endpoint A/B test personas.
 *
 * On vérifie surtout la validation et l'auth — pas l'appel LLM réel.
 */
import { describe, it, expect, vi } from "vitest";

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

describe("POST /api/v2/personas/ab-test", () => {
  it("retourne 400 si message absent", async () => {
    const { POST } = await import("@/app/api/v2/personas/ab-test/route");
    const req = new Request("http://t/api/v2/personas/ab-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personaIdA: "builtin:default", personaIdB: "builtin:formal" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("retourne 400 si personaIdA/B manquants", async () => {
    const { POST } = await import("@/app/api/v2/personas/ab-test/route");
    const req = new Request("http://t/api/v2/personas/ab-test", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "salut" }),
    });
    const res = await POST(req as unknown as import("next/server").NextRequest);
    expect(res.status).toBe(400);
  });

  it("retourne 503 quand ANTHROPIC_API_KEY n'est pas configuré", async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const { POST } = await import("@/app/api/v2/personas/ab-test/route");
      const req = new Request("http://t/api/v2/personas/ab-test", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "salut",
          personaIdA: "builtin:default",
          personaIdB: "builtin:formal",
        }),
      });
      const res = await POST(req as unknown as import("next/server").NextRequest);
      expect(res.status).toBe(503);
    } finally {
      if (previous !== undefined) process.env.ANTHROPIC_API_KEY = previous;
    }
  });
});
