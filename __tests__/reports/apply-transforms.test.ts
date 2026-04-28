/**
 * Tests du dispatcher de transforms + tri topologique + composabilité.
 * Mode noCache pour ne pas dépendre de Supabase.
 */

import { describe, expect, it } from "vitest";
import { applyTransforms } from "@/lib/reports/engine/apply-transforms";
import { stableStringify, hashKey } from "@/lib/reports/engine/cache";
import type { TransformOp } from "@/lib/reports/spec/schema";
import type { Tabular } from "@/lib/reports/engine/tabular";

const STRIPE: Tabular = [
  { id: "ch_1", customer: "cus_a", amount: 100, currency: "EUR" },
  { id: "ch_2", customer: "cus_a", amount: 200, currency: "EUR" },
  { id: "ch_3", customer: "cus_b", amount: 50,  currency: "EUR" },
  { id: "ch_4", customer: "cus_c", amount: 300, currency: "USD" },
];

describe("applyTransforms — pipeline simple", () => {
  it("groupe puis dérive", async () => {
    const sources = new Map([["stripe", STRIPE]]);
    const transforms: TransformOp[] = [
      {
        id: "by_currency",
        op: "groupBy",
        inputs: ["stripe"],
        params: {
          by: ["currency"],
          measures: [{ name: "total", fn: "sum", field: "amount" }],
        },
      },
      {
        id: "doubled",
        op: "derive",
        inputs: ["by_currency"],
        params: {
          columns: [{ name: "double_total", expr: "total * 2" }],
        },
      },
    ];
    const out = await applyTransforms(sources, transforms, {
      cacheTtlSeconds: 0,
      noCache: true,
    });
    const final = out.get("doubled");
    expect(final).toHaveLength(2);
    const eur = final?.find((r) => r.currency === "EUR");
    expect(eur).toMatchObject({ total: 350, double_total: 700 });
  });

  it("filtre puis groupe", async () => {
    const sources = new Map([["stripe", STRIPE]]);
    const transforms: TransformOp[] = [
      {
        id: "eur_only",
        op: "filter",
        inputs: ["stripe"],
        params: { where: "currency == 'EUR'" },
      },
      {
        id: "totals",
        op: "groupBy",
        inputs: ["eur_only"],
        params: {
          by: ["customer"],
          measures: [{ name: "spent", fn: "sum", field: "amount" }],
        },
      },
    ];
    const out = await applyTransforms(sources, transforms, {
      cacheTtlSeconds: 0,
      noCache: true,
    });
    const totals = out.get("totals");
    expect(totals).toHaveLength(2);
    expect(totals?.find((r) => r.customer === "cus_a")?.spent).toBe(300);
  });
});

describe("applyTransforms — tri topologique", () => {
  it("réordonne les transforms même donnés out-of-order", async () => {
    const sources = new Map([["raw", STRIPE]]);
    // a dépend de b, b dépend de raw — fournis dans le mauvais ordre.
    const transforms: TransformOp[] = [
      {
        id: "a",
        op: "derive",
        inputs: ["b"],
        params: { columns: [{ name: "x", expr: "amount + 1" }] },
      },
      {
        id: "b",
        op: "filter",
        inputs: ["raw"],
        params: { where: "amount > 0" },
      },
    ];
    const out = await applyTransforms(sources, transforms, {
      cacheTtlSeconds: 0,
      noCache: true,
    });
    const a = out.get("a");
    expect(a?.[0].x).toBe(101);
  });

  it("détecte un cycle", async () => {
    const sources = new Map([["raw", STRIPE]]);
    const transforms: TransformOp[] = [
      {
        id: "a",
        op: "derive",
        inputs: ["b"],
        params: { columns: [{ name: "x", expr: "amount" }] },
      },
      {
        id: "b",
        op: "derive",
        inputs: ["a"],
        params: { columns: [{ name: "y", expr: "x + 1" }] },
      },
    ];
    await expect(
      applyTransforms(sources, transforms, { cacheTtlSeconds: 0, noCache: true }),
    ).rejects.toThrow(/cycle/);
  });

  it("rejette une référence inconnue", async () => {
    const sources = new Map([["raw", STRIPE]]);
    const transforms: TransformOp[] = [
      {
        id: "a",
        op: "filter",
        inputs: ["ghost"],
        params: { where: "true" },
      },
    ];
    await expect(
      applyTransforms(sources, transforms, { cacheTtlSeconds: 0, noCache: true }),
    ).rejects.toThrow(/n'existe pas|introuvable/);
  });
});

describe("applyTransforms — déterminisme temporel via ctx.now", () => {
  it("propage ctx.now aux ops window/diff", async () => {
    const events: Tabular = [
      { id: 1, created_at: "2026-04-01" },
      { id: 2, created_at: "2026-04-25" },
    ];
    const NOW = Date.parse("2026-04-28T00:00:00Z");
    const sources = new Map([["events", events]]);
    const transforms: TransformOp[] = [
      {
        id: "recent",
        op: "window",
        inputs: ["events"],
        params: { range: "7d", field: "created_at" },
      },
    ];
    const out = await applyTransforms(sources, transforms, {
      cacheTtlSeconds: 0,
      noCache: true,
      now: NOW,
    });
    expect(out.get("recent")).toHaveLength(1);
  });
});

describe("stableStringify & hashKey", () => {
  it("est insensible à l'ordre des clés", () => {
    const a = { x: 1, y: 2, z: { a: 1, b: 2 } };
    const b = { z: { b: 2, a: 1 }, y: 2, x: 1 };
    expect(stableStringify(a)).toBe(stableStringify(b));
    expect(hashKey(a)).toBe(hashKey(b));
  });

  it("différencie objets différents", () => {
    expect(hashKey({ x: 1 })).not.toBe(hashKey({ x: 2 }));
  });

  it("hash stable d'un Tabular", () => {
    const t1: Tabular = [{ a: 1 }, { a: 2 }];
    const t2: Tabular = [{ a: 1 }, { a: 2 }];
    expect(hashKey(t1)).toBe(hashKey(t2));
  });

  it("normalise les nombres non-finis vers null", () => {
    expect(stableStringify(NaN)).toBe("null");
    expect(stableStringify(Infinity)).toBe("null");
  });
});
