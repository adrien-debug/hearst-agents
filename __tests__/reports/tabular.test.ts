/**
 * Tests des opérations tabulaires déterministes.
 * Golden datasets + edge cases (vide, null, type mismatch).
 */

import { describe, expect, it } from "vitest";
import {
  filter,
  join,
  groupBy,
  windowOp,
  diff,
  rank,
  derive,
  pivot,
  unionAll,
} from "@/lib/reports/engine/tabular";

const STRIPE = [
  { id: "ch_1", customer: "cus_a", amount: 100, currency: "EUR", created_at: "2026-04-01" },
  { id: "ch_2", customer: "cus_a", amount: 200, currency: "EUR", created_at: "2026-04-15" },
  { id: "ch_3", customer: "cus_b", amount: 50,  currency: "EUR", created_at: "2026-04-20" },
  { id: "ch_4", customer: "cus_c", amount: 300, currency: "USD", created_at: "2026-04-22" },
];

describe("filter", () => {
  it("filtre par condition simple", () => {
    const out = filter(STRIPE, { where: "amount >= 100" });
    expect(out).toHaveLength(3);
    expect(out.map((r) => r.id)).toEqual(["ch_1", "ch_2", "ch_4"]);
  });

  it("filtre avec plusieurs conditions", () => {
    const out = filter(STRIPE, { where: "currency == 'EUR' && amount > 100" });
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("ch_2");
  });

  it("retourne vide si aucune ligne ne match", () => {
    expect(filter(STRIPE, { where: "amount > 9999" })).toHaveLength(0);
  });

  it("ne mute pas l'input", () => {
    const before = JSON.stringify(STRIPE);
    filter(STRIPE, { where: "amount > 0" });
    expect(JSON.stringify(STRIPE)).toBe(before);
  });
});

describe("join", () => {
  const customers = [
    { id: "cus_a", name: "Alice", country: "FR" },
    { id: "cus_b", name: "Bob",   country: "FR" },
    { id: "cus_c", name: "Carol", country: "US" },
  ];

  it("inner join sur clé unique", () => {
    const out = join(STRIPE, customers, {
      on: [{ left: "customer", right: "id" }],
      how: "inner",
    });
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ customer: "cus_a", name: "Alice", country: "FR" });
  });

  it("left join garde les lignes de gauche sans match", () => {
    const partialCustomers = customers.filter((c) => c.id !== "cus_b");
    const out = join(STRIPE, partialCustomers, {
      on: [{ left: "customer", right: "id" }],
      how: "left",
    });
    expect(out).toHaveLength(4);
    const ch3 = out.find((r) => r.id === "ch_3");
    expect(ch3?.name).toBeUndefined();
  });

  it("évite la collision de clés en préfixant 'right_'", () => {
    const a = [{ id: "x", value: 1 }];
    const b = [{ id: "x", value: 99 }];
    const out = join(a, b, { on: [{ left: "id", right: "id" }], how: "inner" });
    expect(out[0].value).toBe(1);
    expect(out[0].right_value).toBe(99);
  });

  it("ignore les rows avec clé null", () => {
    const a = [{ id: null, x: 1 }, { id: "ok", x: 2 }];
    const b = [{ id: "ok", y: 3 }];
    const out = join(a, b, { on: [{ left: "id", right: "id" }], how: "inner" });
    expect(out).toHaveLength(1);
  });
});

describe("groupBy + measures", () => {
  it("count, sum, avg", () => {
    const out = groupBy(STRIPE, {
      by: ["currency"],
      measures: [
        { name: "n", fn: "count" },
        { name: "total", fn: "sum", field: "amount" },
        { name: "moy", fn: "avg", field: "amount" },
      ],
    });
    const eur = out.find((r) => r.currency === "EUR");
    const usd = out.find((r) => r.currency === "USD");
    expect(eur).toMatchObject({ currency: "EUR", n: 3, total: 350 });
    expect(usd).toMatchObject({ currency: "USD", n: 1, total: 300, moy: 300 });
  });

  it("min, max, median, p95", () => {
    const data = [
      { x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 },
      { x: 6 }, { x: 7 }, { x: 8 }, { x: 9 }, { x: 10 },
    ];
    const out = groupBy(data, {
      by: [],
      measures: [
        { name: "lo", fn: "min", field: "x" },
        { name: "hi", fn: "max", field: "x" },
        { name: "med", fn: "median", field: "x" },
        { name: "p", fn: "p95", field: "x" },
      ],
    });
    expect(out[0]).toMatchObject({ lo: 1, hi: 10, med: 5.5 });
    expect(out[0].p).toBeCloseTo(9.55, 2);
  });

  it("groupe par plusieurs colonnes", () => {
    const out = groupBy(STRIPE, {
      by: ["currency", "customer"],
      measures: [{ name: "n", fn: "count" }],
    });
    expect(out).toHaveLength(3); // EUR/cus_a, EUR/cus_b, USD/cus_c
  });

  it("ignore les valeurs non-numériques pour sum", () => {
    const out = groupBy(
      [{ x: 5 }, { x: "abc" }, { x: 10 }],
      { by: [], measures: [{ name: "s", fn: "sum", field: "x" }] },
    );
    expect(out[0].s).toBe(15);
  });

  it("retourne null si aucune valeur valide", () => {
    const out = groupBy(
      [{ x: null }, { x: undefined }],
      { by: [], measures: [{ name: "s", fn: "sum", field: "x" }] },
    );
    expect(out[0].s).toBeNull();
  });
});

describe("windowOp", () => {
  const events = [
    { id: 1, created_at: "2026-04-01T00:00:00Z" }, // -27j de now=2026-04-28
    { id: 2, created_at: "2026-04-15T00:00:00Z" }, // -13j
    { id: 3, created_at: "2026-04-25T00:00:00Z" }, // -3j
    { id: 4, created_at: "2026-03-01T00:00:00Z" }, // hors fenêtre
  ];
  const NOW = Date.parse("2026-04-28T00:00:00Z");

  it("filtre dans une fenêtre 30d", () => {
    const out = windowOp(events, { range: "30d", field: "created_at", now: NOW });
    expect(out.map((r) => r.id)).toEqual([1, 2, 3]);
  });

  it("filtre dans une fenêtre 7d", () => {
    const out = windowOp(events, { range: "7d", field: "created_at", now: NOW });
    expect(out.map((r) => r.id)).toEqual([3]);
  });

  it("ignore les rows sans timestamp valide", () => {
    const out = windowOp(
      [{ id: 1, created_at: "not a date" }, { id: 2, created_at: "2026-04-25" }],
      { range: "30d", field: "created_at", now: NOW },
    );
    expect(out.map((r) => r.id)).toEqual([2]);
  });

  it("rejette un range invalide", () => {
    expect(() => windowOp(events, { range: "30 days", field: "created_at", now: NOW }))
      .toThrow();
  });
});

describe("diff", () => {
  const charges = [
    // précédent (J-29 → J-15) = somme 50
    { amount: 30, created_at: "2026-04-05" },
    { amount: 20, created_at: "2026-04-10" },
    // courant (J-14 → J) = somme 250
    { amount: 100, created_at: "2026-04-20" },
    { amount: 150, created_at: "2026-04-25" },
  ];
  const NOW = Date.parse("2026-04-28T00:00:00Z");

  it("calcule current/previous/delta sur deux fenêtres", () => {
    const out = diff(charges, { field: "amount", window: "14d", timeField: "created_at", now: NOW });
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ current: 250, previous: 50, delta: 200 });
    expect(out[0].delta_pct).toBeCloseTo(4, 5); // (250-50)/50 = 4
  });

  it("delta_pct null si previous = 0", () => {
    const data = [
      { amount: 0, created_at: "2026-04-05" },
      { amount: 100, created_at: "2026-04-25" },
    ];
    const out = diff(data, { field: "amount", window: "14d", timeField: "created_at", now: NOW });
    expect(out[0].delta_pct).toBeNull();
  });

  it("sans timeField, coupe au milieu", () => {
    const data = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }];
    const out = diff(data, { field: "x", window: "1d" });
    expect(out[0]).toMatchObject({ previous: 3, current: 7, delta: 4 });
  });
});

describe("rank", () => {
  it("trie descendant et limite", () => {
    const data = [{ v: 1 }, { v: 5 }, { v: 3 }, { v: 4 }, { v: 2 }];
    const out = rank(data, { by: "v", direction: "desc", limit: 3 });
    expect(out.map((r) => r.v)).toEqual([5, 4, 3]);
    expect(out.map((r) => r._rank)).toEqual([1, 2, 3]);
  });

  it("trie ascendant", () => {
    const data = [{ v: 3 }, { v: 1 }, { v: 2 }];
    const out = rank(data, { by: "v", direction: "asc" });
    expect(out.map((r) => r.v)).toEqual([1, 2, 3]);
  });

  it("limite par défaut à 20", () => {
    const data = Array.from({ length: 50 }, (_, i) => ({ v: i }));
    const out = rank(data, { by: "v" });
    expect(out).toHaveLength(20);
  });
});

describe("derive", () => {
  it("ajoute une colonne calculée", () => {
    const data = [{ a: 10, b: 2 }, { a: 5, b: 5 }];
    const out = derive(data, { columns: [{ name: "ratio", expr: "a / b" }] });
    expect(out[0].ratio).toBe(5);
    expect(out[1].ratio).toBe(1);
  });

  it("permet plusieurs colonnes en cascade", () => {
    const data = [{ price: 100, qty: 3 }];
    const out = derive(data, {
      columns: [
        { name: "subtotal", expr: "price * qty" },
        { name: "tax", expr: "subtotal * 0.2" },
      ],
    });
    expect(out[0].subtotal).toBe(300);
    expect(out[0].tax).toBe(60);
  });

  it("ne mute pas l'input", () => {
    const data = [{ x: 1 }];
    const before = JSON.stringify(data);
    derive(data, { columns: [{ name: "y", expr: "x + 1" }] });
    expect(JSON.stringify(data)).toBe(before);
  });
});

describe("pivot", () => {
  it("pivote correctement", () => {
    const data = [
      { region: "FR", product: "A", revenue: 100 },
      { region: "FR", product: "B", revenue: 200 },
      { region: "US", product: "A", revenue: 50 },
    ];
    const out = pivot(data, {
      rows: ["region"],
      columns: "product",
      values: { field: "revenue", fn: "sum" },
    });
    const fr = out.find((r) => r.region === "FR");
    const us = out.find((r) => r.region === "US");
    expect(fr).toMatchObject({ region: "FR", A: 100, B: 200 });
    expect(us).toMatchObject({ region: "US", A: 50 });
    expect(us!.B).toBeUndefined();
  });

  it("compte avec fn=count", () => {
    const data = [
      { dept: "eng", level: "junior" },
      { dept: "eng", level: "senior" },
      { dept: "eng", level: "junior" },
    ];
    const out = pivot(data, {
      rows: ["dept"],
      columns: "level",
      values: { field: "level", fn: "count" },
    });
    expect(out[0]).toMatchObject({ dept: "eng", junior: 2, senior: 1 });
  });
});

describe("unionAll", () => {
  it("concatène plusieurs tables", () => {
    const a = [{ x: 1 }, { x: 2 }];
    const b = [{ x: 3 }];
    const c = [{ x: 4 }, { x: 5 }];
    const out = unionAll(a, b, c);
    expect(out).toHaveLength(5);
    expect(out.map((r) => r.x)).toEqual([1, 2, 3, 4, 5]);
  });

  it("retourne vide si toutes les tables sont vides", () => {
    expect(unionAll([], [])).toHaveLength(0);
  });
});

describe("composabilité — chaînage filter → groupBy → derive", () => {
  it("calcule un MRR par devise + delta_pct dérivé", () => {
    const filtered = filter(STRIPE, { where: "amount > 0" });
    const grouped = groupBy(filtered, {
      by: ["currency"],
      measures: [{ name: "mrr", fn: "sum", field: "amount" }],
    });
    const derived = derive(grouped, {
      columns: [{ name: "doubled", expr: "mrr * 2" }],
    });
    expect(derived).toHaveLength(2);
    const eur = derived.find((r) => r.currency === "EUR");
    expect(eur).toMatchObject({ mrr: 350, doubled: 700 });
  });
});
