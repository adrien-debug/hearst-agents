/**
 * Tests — `buildPersonaAddon` & `buildPersonaAddonOrNull`.
 */
import { describe, it, expect } from "vitest";
import {
  buildPersonaAddon,
  buildPersonaAddonOrNull,
} from "@/lib/personas/system-prompt-addon";
import type { Persona } from "@/lib/personas/types";

function makePersona(overrides: Partial<Persona>): Persona {
  return {
    id: "p1",
    userId: "user1",
    tenantId: "tenant1",
    name: "P1",
    description: undefined,
    tone: null,
    vocabulary: null,
    styleGuide: null,
    systemPromptAddon: null,
    surface: null,
    isDefault: false,
    createdAt: "2026-04-01T00:00:00Z",
    updatedAt: "2026-04-01T00:00:00Z",
    ...overrides,
  };
}

describe("buildPersonaAddon", () => {
  it("inclut name, ton, vocabulaire et style guide", () => {
    const persona = makePersona({
      name: "Founder Voice",
      description: "Voix punchy, exec.",
      tone: "direct",
      vocabulary: { preferred: ["delta", "ROI"], avoid: ["yo"] },
      styleGuide: "1 phrase verdict.",
    });
    const out = buildPersonaAddon(persona);
    expect(out).toMatch(/<persona>/);
    expect(out).toMatch(/<\/persona>/);
    expect(out).toContain("Founder Voice");
    expect(out).toContain("direct");
    expect(out).toContain("delta, ROI");
    expect(out).toContain("À éviter : yo");
    expect(out).toContain("1 phrase verdict.");
  });

  it("cap à 1500 chars", () => {
    const big = "x".repeat(5000);
    const persona = makePersona({ styleGuide: big });
    const out = buildPersonaAddon(persona);
    // Body ≤ 1500 → wrapper rajoute <persona>\n + \n</persona> (~22 chars max)
    expect(out.length).toBeLessThanOrEqual(1500 + 32);
  });
});

describe("buildPersonaAddonOrNull", () => {
  it("retourne null si la persona est vide", () => {
    const persona = makePersona({ name: "vide" });
    expect(buildPersonaAddonOrNull(persona)).toBeNull();
  });

  it("retourne le bloc si au moins un champ utile est rempli", () => {
    const persona = makePersona({ tone: "casual" });
    expect(buildPersonaAddonOrNull(persona)).toMatch(/<persona>/);
  });

  it("retourne null pour persona null/undefined", () => {
    expect(buildPersonaAddonOrNull(null)).toBeNull();
    expect(buildPersonaAddonOrNull(undefined)).toBeNull();
  });
});
