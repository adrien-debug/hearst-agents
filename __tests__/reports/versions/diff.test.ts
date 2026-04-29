/**
 * Tests unitaires : lib/reports/versions/diff.ts
 * Déterministe, sans LLM, sans réseau.
 */

import { describe, expect, it } from "vitest";
import { diffVersions } from "@/lib/reports/versions/diff";
import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";

// ── Helpers ───────────────────────────────────────────────────

function makePayload(blocks: RenderedBlock[], specId = "s1"): RenderPayload {
  return {
    __reportPayload: true,
    specId,
    version: 1,
    generatedAt: Date.now(),
    blocks,
    scalars: {},
  };
}

function kpiBlock(id: string, value: number): RenderedBlock {
  return { id, type: "kpi", layout: { col: 1, row: 0 }, data: { value }, props: {} };
}

function tableBlock(id: string, rows: number): RenderedBlock {
  return {
    id,
    type: "table",
    layout: { col: 4, row: 0 },
    data: Array.from({ length: rows }, (_, i) => ({ n: i })),
    props: {},
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe("diffVersions — versions identiques", () => {
  it("retourne [] si les deux payloads sont identiques", () => {
    const p = makePayload([kpiBlock("mrr", 1000)]);
    const diffs = diffVersions(p, p);
    expect(diffs).toEqual([]);
  });

  it("retourne [] si narrations identiques", () => {
    const p = makePayload([kpiBlock("mrr", 1000)]);
    const diffs = diffVersions(p, p, "hello", "hello");
    expect(diffs).toEqual([]);
  });
});

describe("diffVersions — block ajouté", () => {
  it("détecte un block ajouté dans B", () => {
    const a = makePayload([kpiBlock("mrr", 1000)]);
    const b = makePayload([kpiBlock("mrr", 1000), kpiBlock("churn", 5)]);
    const diffs = diffVersions(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ blockRef: "churn", kind: "added" });
  });
});

describe("diffVersions — block supprimé", () => {
  it("détecte un block supprimé (dans A, pas dans B)", () => {
    const a = makePayload([kpiBlock("mrr", 1000), kpiBlock("arr", 2000)]);
    const b = makePayload([kpiBlock("mrr", 1000)]);
    const diffs = diffVersions(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({ blockRef: "arr", kind: "removed" });
  });
});

describe("diffVersions — valeur KPI changée", () => {
  it("détecte un changement de data.value sur un KPI", () => {
    const a = makePayload([kpiBlock("mrr", 1000)]);
    const b = makePayload([kpiBlock("mrr", 1200)]);
    const diffs = diffVersions(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      blockRef: "mrr",
      kind: "changed",
      fieldPath: "data.value",
      before: 1000,
      after: 1200,
    });
  });

  it("ne détecte pas de diff si la valeur est identique", () => {
    const a = makePayload([kpiBlock("mrr", 1000)]);
    const b = makePayload([kpiBlock("mrr", 1000)]);
    const diffs = diffVersions(a, b);
    expect(diffs).toEqual([]);
  });
});

describe("diffVersions — row count table changé", () => {
  it("détecte un changement de nombre de rows", () => {
    const a = makePayload([tableBlock("users", 10)]);
    const b = makePayload([tableBlock("users", 15)]);
    const diffs = diffVersions(a, b);
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      blockRef: "users",
      kind: "changed",
      fieldPath: "data.rowCount",
      before: 10,
      after: 15,
    });
  });
});

describe("diffVersions — narration changée", () => {
  it("détecte un changement de narration", () => {
    const p = makePayload([kpiBlock("mrr", 1000)]);
    const diffs = diffVersions(p, p, "ancienne narration", "nouvelle narration");
    expect(diffs).toHaveLength(1);
    expect(diffs[0]).toMatchObject({
      blockRef: "__narration__",
      kind: "changed",
      fieldPath: "narration",
      before: "ancienne narration",
      after: "nouvelle narration",
    });
  });

  it("ne diff pas si narration non fournie", () => {
    const p = makePayload([kpiBlock("mrr", 1000)]);
    const diffs = diffVersions(p, p);
    expect(diffs).toEqual([]);
  });
});

describe("diffVersions — combiné", () => {
  it("détecte simultanément ajout, suppression et changement", () => {
    const a = makePayload([kpiBlock("mrr", 1000), kpiBlock("arr", 5000)]);
    const b = makePayload([kpiBlock("mrr", 1200), kpiBlock("churn", 3)]);
    const diffs = diffVersions(a, b);

    const kinds = diffs.map((d) => `${d.blockRef}:${d.kind}`).sort();
    expect(kinds).toContain("arr:removed");
    expect(kinds).toContain("churn:added");
    expect(kinds).toContain("mrr:changed");
  });
});
