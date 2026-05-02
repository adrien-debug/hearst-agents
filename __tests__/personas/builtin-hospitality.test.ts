/**
 * Smoke test : la persona builtin hospitality-concierge est lookable
 * via getPersonaById et expose son systemPromptAddon avec le vocabulaire
 * métier hospitality (guest, RevPAR, ADR…).
 */

import { describe, it, expect, vi } from "vitest";
import { getPersonaById } from "@/lib/personas/store";
import { BUILTIN_PERSONAS } from "@/lib/personas/defaults";

vi.mock("@/lib/platform/db/supabase", () => ({
  getServerSupabase: () => null,
}));

const SCOPE = { userId: "test-user", tenantId: "test-tenant" };
const HOSPITALITY_ID = "builtin:hospitality-concierge";

describe("Persona builtin hospitality-concierge", () => {
  it("est présente dans BUILTIN_PERSONAS", () => {
    const found = BUILTIN_PERSONAS.find((p) => p.id === HOSPITALITY_ID);
    expect(found).toBeDefined();
    expect(found?.name).toBe("Hospitality Concierge");
    expect(found?.tone).toBe("formal");
  });

  it("getPersonaById résout le builtin avec scope rempli", async () => {
    const persona = await getPersonaById(HOSPITALITY_ID, SCOPE);
    expect(persona).not.toBeNull();
    expect(persona?.id).toBe(HOSPITALITY_ID);
    expect(persona?.userId).toBe(SCOPE.userId);
    expect(persona?.tenantId).toBe(SCOPE.tenantId);
  });

  it("expose un systemPromptAddon avec vocabulaire hospitality clé", async () => {
    const persona = await getPersonaById(HOSPITALITY_ID, SCOPE);
    expect(persona?.systemPromptAddon).toMatch(/guest/i);
    expect(persona?.systemPromptAddon).toMatch(/RevPAR/);
    expect(persona?.systemPromptAddon).toMatch(/ADR/);
    expect(persona?.systemPromptAddon).toMatch(/PMS/);
  });

  it("vocabulary inclut les termes préférés et bannit 'client'", async () => {
    const persona = await getPersonaById(HOSPITALITY_ID, SCOPE);
    expect(persona?.vocabulary?.preferred).toContain("guest");
    expect(persona?.vocabulary?.preferred).toContain("VIP");
    expect(persona?.vocabulary?.avoid).toContain("client");
  });
});
