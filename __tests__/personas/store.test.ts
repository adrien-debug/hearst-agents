/**
 * Tests — store personas.
 *
 * En l'absence de Supabase configuré (env de test), `getServerSupabase()`
 * renvoie null → on vérifie le comportement fallback (builtins).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: vi.fn(() => null),
}));

import {
  listPersonasForUser,
  getPersonaById,
  getDefaultPersona,
  getPersonaForSurface,
} from "@/lib/personas/store";
import { BUILTIN_PERSONAS } from "@/lib/personas/defaults";

describe("personas store — fallback builtins (Supabase absent)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("listPersonasForUser renvoie les builtins re-scopés", async () => {
    const out = await listPersonasForUser("user-1", "tenant-1");
    expect(out.length).toBe(BUILTIN_PERSONAS.length);
    expect(out.every((p) => p.userId === "user-1")).toBe(true);
    expect(out.every((p) => p.tenantId === "tenant-1")).toBe(true);
  });

  it("getPersonaById retourne le builtin attendu", async () => {
    const out = await getPersonaById("builtin:formal", {
      userId: "u",
      tenantId: "t",
    });
    expect(out).not.toBeNull();
    expect(out?.name).toBe("Inbox formel");
  });

  it("getDefaultPersona renvoie le builtin par défaut", async () => {
    const out = await getDefaultPersona({ userId: "u", tenantId: "t" });
    expect(out?.id).toBe("builtin:default");
  });

  it("getPersonaForSurface retourne la persona par surface", async () => {
    const out = await getPersonaForSurface("simulation", {
      userId: "u",
      tenantId: "t",
    });
    expect(out?.id).toBe("builtin:analytical");
  });

  it("getPersonaForSurface retourne null si surface inconnue", async () => {
    const out = await getPersonaForSurface("inexistant", {
      userId: "u",
      tenantId: "t",
    });
    expect(out).toBeNull();
  });
});
