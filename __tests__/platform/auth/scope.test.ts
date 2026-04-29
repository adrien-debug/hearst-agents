/**
 * Scope middleware — règle anti-fallback email après cleanup Phase 2.
 *
 * `requireScope()` doit retourner 401 si `getUserId()` retourne null.
 * Avant Phase 2, `getUserId()` retombait sur `session.user.email` —
 * donc une session sans UUID résolu passait le middleware. Désormais :
 * pas de UUID = 401, point.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetUserId = vi.hoisted(() => vi.fn());

vi.mock("@/lib/platform/auth/get-user-id", () => ({
  getUserId: mockGetUserId,
}));

const ENV_BACKUP_TENANT = process.env.HEARST_TENANT_ID;
const ENV_BACKUP_WORKSPACE = process.env.HEARST_WORKSPACE_ID;
const VALID_UUID = "36914162-75f9-4c27-b38b-bb050f51d52b";

describe("requireScope (401 sur UUID non résolu)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetUserId.mockReset();
    // Force dev fallback OK pour tenant/workspace afin d'isoler le test
    // sur la résolution userId uniquement.
    process.env.HEARST_TENANT_ID = "test-tenant";
    process.env.HEARST_WORKSPACE_ID = "test-workspace";
  });

  afterEach(() => {
    if (ENV_BACKUP_TENANT === undefined) delete process.env.HEARST_TENANT_ID;
    else process.env.HEARST_TENANT_ID = ENV_BACKUP_TENANT;
    if (ENV_BACKUP_WORKSPACE === undefined) delete process.env.HEARST_WORKSPACE_ID;
    else process.env.HEARST_WORKSPACE_ID = ENV_BACKUP_WORKSPACE;
  });

  it("returns 401 when getUserId returns null (no UUID resolved)", async () => {
    mockGetUserId.mockResolvedValueOnce(null);
    const { requireScope } = await import("@/lib/platform/auth/scope");
    const result = await requireScope({ context: "test" });

    expect(result.scope).toBeNull();
    expect(result.error).not.toBeNull();
    expect(result.error?.status).toBe(401);
    expect(result.error?.message).toBe("not_authenticated");
  });

  it("returns scope with UUID when getUserId returns a valid UUID", async () => {
    mockGetUserId.mockResolvedValueOnce(VALID_UUID);
    const { requireScope } = await import("@/lib/platform/auth/scope");
    const result = await requireScope({ context: "test" });

    expect(result.error).toBeNull();
    expect(result.scope).not.toBeNull();
    expect(result.scope?.userId).toBe(VALID_UUID);
    // Vérifie qu'il s'agit bien d'un UUID, pas d'un email
    expect(result.scope?.userId).toMatch(/^[0-9a-f]{8}-/i);
    expect(result.scope?.userId).not.toMatch(/@/);
  });

  it("scope.userId stays the value getUserId returned (no email fallback in middleware)", async () => {
    // Si getUserId retourne null (cas où le UUID lookup public.users a
    // échoué), requireScope ne doit PAS fabriquer un identifiant
    // alternatif depuis session.user.email. C'est exactement le bug que
    // Phase 2 corrige.
    mockGetUserId.mockResolvedValueOnce(null);
    const { resolveScope } = await import("@/lib/platform/auth/scope");
    const scope = await resolveScope({ context: "test" });
    expect(scope).toBeNull();
  });
});
