/**
 * Tests du renderer JSON — vérifie le shape du payload et l'extraction des
 * scalaires sans toucher au LLM.
 */

import { describe, expect, it } from "vitest";
import { renderBlocks } from "@/lib/reports/engine/render-blocks";
import type { ReportSpec } from "@/lib/reports/spec/schema";
import type { Tabular } from "@/lib/reports/engine/tabular";

const SPEC_ID = "00000000-0000-4000-8000-000000000001";

function baseSpec(): ReportSpec {
  return {
    id: SPEC_ID,
    version: 1,
    meta: {
      title: "Test",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope: { tenantId: "t", workspaceId: "w" },
    sources: [
      { id: "src", kind: "composio", spec: { action: "X", params: {} } },
    ],
    transforms: [],
    blocks: [],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("renderBlocks — kpi", () => {
  it("extrait value/delta/sparkline depuis la première row", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "mrr_kpi",
        type: "kpi",
        dataRef: "src",
        layout: { col: 1, row: 0 },
        props: { field: "mrr", deltaField: "delta", sparklineField: "v" },
      },
    ];
    const data: Tabular = [
      { mrr: 1000, delta: 0.12, v: 100 },
      { v: 110 },
      { v: 120 },
    ];
    const out = renderBlocks(spec, new Map([["src", data]]), 1700000000000);
    expect(out.__reportPayload).toBe(true);
    expect(out.blocks).toHaveLength(1);
    const kpi = out.blocks[0].data as { value: unknown; delta: unknown; sparkline: number[] };
    expect(kpi.value).toBe(1000);
    expect(kpi.delta).toBe(0.12);
    expect(kpi.sparkline).toEqual([100, 110, 120]);
  });

  it("publie les scalaires {id}.value et {id}.delta", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "k",
        type: "kpi",
        dataRef: "src",
        layout: { col: 1, row: 0 },
        props: { field: "x", deltaField: "d" },
      },
    ];
    const out = renderBlocks(
      spec,
      new Map([["src", [{ x: 42, d: -3 }]]]),
      0,
    );
    expect(out.scalars["k.value"]).toBe(42);
    expect(out.scalars["k.delta"]).toBe(-3);
  });
});

describe("renderBlocks — autres types passent les rows", () => {
  it("table conserve les rows", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "t",
        type: "table",
        dataRef: "src",
        layout: { col: 4, row: 0 },
        props: {},
      },
    ];
    const data: Tabular = [{ a: 1 }, { a: 2 }];
    const out = renderBlocks(spec, new Map([["src", data]]), 0);
    expect(out.blocks[0].data).toEqual(data);
  });

  it("limite à MAX_ROWS_PER_BLOCK rows", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "t",
        type: "table",
        dataRef: "src",
        layout: { col: 4, row: 0 },
        props: {},
      },
    ];
    const data: Tabular = Array.from({ length: 500 }, (_, i) => ({ x: i }));
    const out = renderBlocks(spec, new Map([["src", data]]), 0);
    expect((out.blocks[0].data as Tabular).length).toBe(200);
  });

  it("pour bar/funnel/pareto avec valueField : prend le top-N par valeur", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "b",
        type: "bar",
        dataRef: "src",
        layout: { col: 4, row: 0 },
        props: { valueField: "v" },
      },
    ];
    const data: Tabular = Array.from({ length: 250 }, (_, i) => ({ name: `n${i}`, v: i }));
    const out = renderBlocks(spec, new Map([["src", data]]), 0);
    const sliced = out.blocks[0].data as Tabular;
    expect(sliced.length).toBe(200);
    expect(sliced[0].v).toBe(249); // top descendant
  });
});

describe("renderBlocks — payload meta", () => {
  it("inclut specId, version, generatedAt", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "k",
        type: "kpi",
        dataRef: "src",
        layout: { col: 1, row: 0 },
        props: { field: "x" },
      },
    ];
    const out = renderBlocks(spec, new Map([["src", [{ x: 1 }]]]), 1700000000000);
    expect(out.specId).toBe(SPEC_ID);
    expect(out.version).toBe(1);
    expect(out.generatedAt).toBe(1700000000000);
  });

  it("rejette un block dont le dataRef n'est pas calculé", () => {
    const spec = baseSpec();
    spec.blocks = [
      {
        id: "k",
        type: "kpi",
        dataRef: "ghost",
        layout: { col: 1, row: 0 },
        props: { field: "x" },
      },
    ];
    expect(() => renderBlocks(spec, new Map([["src", []]]), 0))
      .toThrow(/n'a pas été calculé/);
  });
});
