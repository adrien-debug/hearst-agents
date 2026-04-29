/**
 * getUserId — règle anti-fallback email après cleanup Phase 2.
 *
 * Garde-fous :
 *   1. DEV_BYPASS retourne un UUID (pas un email)
 *   2. Session avec user.id (UUID) → retour UUID
 *   3. Session avec userId top-level (legacy) → retour string
 *   4. Session sans aucun UUID résolu → null (pas de fallback email)
 *   5. Pas de session → null
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetServerSession = vi.hoisted(() => vi.fn());

vi.mock("next-auth", () => ({
  getServerSession: mockGetServerSession,
}));

vi.mock("@/lib/platform/auth/options", () => ({
  authOptions: {},
}));

const ENV_BACKUP = process.env.HEARST_DEV_AUTH_BYPASS;
const VALID_UUID = "36914162-75f9-4c27-b38b-bb050f51d52b";

describe("getUserId", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetServerSession.mockReset();
    delete process.env.HEARST_DEV_AUTH_BYPASS;
  });

  afterEach(() => {
    if (ENV_BACKUP === undefined) {
      delete process.env.HEARST_DEV_AUTH_BYPASS;
    } else {
      process.env.HEARST_DEV_AUTH_BYPASS = ENV_BACKUP;
    }
  });

  it("returns DEV_USER UUID when HEARST_DEV_AUTH_BYPASS=1", async () => {
    process.env.HEARST_DEV_AUTH_BYPASS = "1";
    const { getUserId } = await import("@/lib/platform/auth/get-user-id");
    const result = await getUserId();
    expect(result).toBe(VALID_UUID);
    // Vérifie qu'il s'agit bien d'un UUID, pas d'un email
    expect(result).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    expect(result).not.toMatch(/@/);
    expect(mockGetServerSession).not.toHaveBeenCalled();
  });

  it("returns session.user.id (UUID) when present", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      user: { id: VALID_UUID, email: "adrien@hearstcorporation.io" },
    });
    const { getUserId } = await import("@/lib/platform/auth/get-user-id");
    const result = await getUserId();
    expect(result).toBe(VALID_UUID);
    expect(result).not.toBe("adrien@hearstcorporation.io");
  });

  it("returns session.userId (legacy top-level) when no user.id", async () => {
    mockGetServerSession.mockResolvedValueOnce({
      userId: VALID_UUID,
      user: { email: "adrien@hearstcorporation.io" },
    });
    const { getUserId } = await import("@/lib/platform/auth/get-user-id");
    const result = await getUserId();
    expect(result).toBe(VALID_UUID);
  });

  it("returns null when session exists but no UUID resolved (anti-fallback email)", async () => {
    // Cas du callback NextAuth qui n'a pas pu résoudre l'UUID
    // (ex: DB indispo, public.users vide). Comportement attendu :
    // null, PAS l'email.
    mockGetServerSession.mockResolvedValueOnce({
      user: { email: "adrien@hearstcorporation.io" },
    });
    const { getUserId } = await import("@/lib/platform/auth/get-user-id");
    const result = await getUserId();
    expect(result).toBeNull();
  });

  it("returns null when no session", async () => {
    mockGetServerSession.mockResolvedValueOnce(null);
    const { getUserId } = await import("@/lib/platform/auth/get-user-id");
    const result = await getUserId();
    expect(result).toBeNull();
  });
});
