/**
 * Tests pour findCatalogByFuzzyName — tolérance typos sur les titres
 * du catalog.
 */

import { describe, expect, it } from "vitest";
import { findCatalogByFuzzyName, CATALOG } from "@/lib/reports/catalog";

describe("findCatalogByFuzzyName", () => {
  it("match exact insensible à la casse + accents", () => {
    const m = findCatalogByFuzzyName("Founder Cockpit");
    expect(m).not.toBeNull();
    expect(m!.entry.title).toBe("Founder Cockpit");
    expect(m!.kind).toBe("exact");
    expect(m!.distance).toBe(0);
  });

  it("match malgré une typo proche (Customer 3600 → Customer 360)", () => {
    const m = findCatalogByFuzzyName("Customer 3600");
    expect(m).not.toBeNull();
    expect(m!.entry.title).toBe("Customer 360");
    expect(m!.kind).toBe("levenshtein");
    expect(m!.distance).toBeLessThanOrEqual(3);
  });

  it("match prefix (préfixe partiel)", () => {
    const m = findCatalogByFuzzyName("Founder");
    expect(m).not.toBeNull();
    expect(m!.entry.title).toBe("Founder Cockpit");
    expect(m!.kind).toBe("prefix");
  });

  it("match substring (terme contenu dans le titre)", () => {
    const m = findCatalogByFuzzyName("velocity");
    expect(m).not.toBeNull();
    expect(m!.entry.title).toBe("Engineering Velocity");
    expect(m!.kind).toBe("substring");
  });

  it("retourne null si aucune entrée raisonnablement proche", () => {
    const m = findCatalogByFuzzyName("xyz");
    expect(m).toBeNull();
  });

  it("plafond Levenshtein configurable", () => {
    // « Cockpitt » a distance 1 vs « Cockpit » → dans le seuil 3 par défaut
    const lax = findCatalogByFuzzyName("Founder Cockpitt");
    expect(lax).not.toBeNull();
    expect(lax!.entry.title).toBe("Founder Cockpit");

    // Avec un cap dur à 0, refuse les distances > 0
    const strict = findCatalogByFuzzyName("Founder Cockpitt", { maxLevenshtein: 0 });
    expect(strict).toBeNull();
  });

  it("traite les tirets cadratins comme espaces (— vs  )", () => {
    const m = findCatalogByFuzzyName("Daily Briefing Hospitality");
    expect(m).not.toBeNull();
    expect(m!.entry.title).toContain("Daily Briefing");
  });

  it("traverse tout le catalog sans erreur", () => {
    // sanity : chaque entry doit matcher exactement son propre titre
    for (const entry of CATALOG) {
      const m = findCatalogByFuzzyName(entry.title);
      expect(m).not.toBeNull();
      expect(m!.entry.id).toBe(entry.id);
    }
  });
});
