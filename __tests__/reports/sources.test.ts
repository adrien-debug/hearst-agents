/**
 * Tests des fonctions pures des source adapters.
 * Composio/Google nécessitent des credentials → testés indirectement par
 * smoke test qui vérifie le path d'erreur gracieux.
 */

import { describe, expect, it } from "vitest";
import {
  extractTabular,
  applyMapping,
} from "@/lib/reports/sources/extract";

describe("extractTabular — payloads hétérogènes", () => {
  it("retourne un Array tel quel", () => {
    const out = extractTabular([{ a: 1 }, { a: 2 }]);
    expect(out).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it("trouve un Array sous .items", () => {
    const out = extractTabular({ items: [{ x: 1 }] });
    expect(out).toEqual([{ x: 1 }]);
  });

  it("trouve un Array sous .data.items (Composio classique)", () => {
    const out = extractTabular({ data: { items: [{ x: 1 }, { x: 2 }] } });
    expect(out).toHaveLength(2);
  });

  it("trouve un Array sous .results (HubSpot/Salesforce)", () => {
    const out = extractTabular({ results: [{ id: 1 }, { id: 2 }, { id: 3 }] });
    expect(out).toHaveLength(3);
  });

  it("trouve .messages (Gmail/Slack pattern)", () => {
    const out = extractTabular({ messages: [{ id: "m1" }] });
    expect(out).toEqual([{ id: "m1" }]);
  });

  it("retourne [] pour un objet sans Array reconnaissable", () => {
    const out = extractTabular({ unrelated: { foo: "bar" } });
    expect(out).toEqual([]);
  });

  it("retourne [] pour null/undefined", () => {
    expect(extractTabular(null)).toEqual([]);
    expect(extractTabular(undefined)).toEqual([]);
  });

  it("traite un objet ressemblant à une row comme singleton", () => {
    const out = extractTabular({ name: "Alice", age: 30 });
    expect(out).toEqual([{ name: "Alice", age: 30 }]);
  });

  it("normalise les éléments scalaires en { value }", () => {
    const out = extractTabular([1, 2, 3]);
    expect(out).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }]);
  });

  it("garde-fou contre récursion profonde", () => {
    let nested: Record<string, unknown> = { items: [] };
    for (let i = 0; i < 10; i++) {
      nested = { data: nested };
    }
    const out = extractTabular(nested);
    expect(Array.isArray(out)).toBe(true);
  });
});

describe("applyMapping — projection canonique", () => {
  it("renomme les champs selon le mapping", () => {
    const rows = [{ amount_total: 100 }, { amount_total: 200 }];
    const out = applyMapping(rows, [{ from: "amount_total", to: "amount_cents" }]);
    expect(out).toEqual([
      { amount_total: 100, amount_cents: 100 },
      { amount_total: 200, amount_cents: 200 },
    ]);
  });

  it("ignore les champs absents", () => {
    const rows = [{ a: 1 }];
    const out = applyMapping(rows, [{ from: "ghost", to: "alias" }]);
    expect(out).toEqual([{ a: 1 }]);
  });

  it("retourne rows tel quel si pas de mapping", () => {
    const rows = [{ a: 1 }];
    expect(applyMapping(rows, undefined)).toBe(rows);
    expect(applyMapping(rows, [])).toBe(rows);
  });
});
