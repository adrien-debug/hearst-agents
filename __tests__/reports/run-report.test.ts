/**
 * Test integration du pipeline complet avec sourceLoader injecté + noCache.
 *
 * Ne teste PAS la narration LLM (couverte indirectement par narrate.ts —
 * exécution réelle nécessiterait ANTHROPIC_API_KEY mocké, deferred V2).
 */

import { describe, expect, it, vi } from "vitest";
import { runReport, type SourceLoader } from "@/lib/reports/engine/run-report";
import type { ReportSpec } from "@/lib/reports/spec/schema";

const SPEC_ID = "00000000-0000-4000-8000-000000000099";

function buildSpec(): ReportSpec {
  return {
    id: SPEC_ID,
    version: 1,
    meta: {
      title: "Mini Cockpit",
      summary: "",
      domain: "founder",
      persona: "founder",
      cadence: "ad-hoc",
      confidentiality: "internal",
    },
    scope: { tenantId: "t", workspaceId: "w" },
    sources: [
      { id: "stripe", kind: "composio", spec: { action: "STRIPE_LIST", params: {} } },
    ],
    transforms: [
      {
        id: "totals",
        op: "groupBy",
        inputs: ["stripe"],
        params: {
          by: ["currency"],
          measures: [{ name: "mrr", fn: "sum", field: "amount" }],
        },
      },
    ],
    blocks: [
      {
        id: "k",
        type: "kpi",
        dataRef: "totals",
        layout: { col: 1, row: 0 },
        props: { field: "mrr" },
      },
    ],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("runReport — pipeline end-to-end avec mocks", () => {
  it("execute fetch → transform → render et retourne un payload cohérent", async () => {
    const spec = buildSpec();

    const sourceLoader: SourceLoader = async () => {
      return new Map([
        [
          "stripe",
          [
            { amount: 100, currency: "EUR" },
            { amount: 200, currency: "EUR" },
            { amount: 50, currency: "USD" },
          ],
        ],
      ]);
    };

    const result = await runReport(spec, {
      sourceLoader,
      noCache: true,
    });

    expect(result.payload.__reportPayload).toBe(true);
    expect(result.payload.blocks).toHaveLength(1);

    const kpi = result.payload.blocks[0].data as { value: unknown };
    // L'agrégat sum sur EUR uniquement vaudrait 300 — mais le KPI prend la
    // première row du dataset 'totals'. groupBy sans tri retourne dans l'ordre
    // d'apparition, donc EUR en premier.
    expect(kpi.value).toBe(300);
    expect(result.cacheHit.render).toBe(false);
  });

  it("propage ctx.now au pipeline (window/diff déterministes)", async () => {
    const spec = buildSpec();
    spec.transforms = [
      {
        id: "recent",
        op: "window",
        inputs: ["stripe"],
        params: { range: "7d", field: "created_at" },
      },
    ];
    spec.blocks = [
      {
        id: "t",
        type: "table",
        dataRef: "recent",
        layout: { col: 4, row: 0 },
        props: {},
      },
    ];

    const NOW = Date.parse("2026-04-28T00:00:00Z");

    const sourceLoader: SourceLoader = async () => {
      return new Map([
        [
          "stripe",
          [
            { id: 1, created_at: "2026-04-25" }, // -3j
            { id: 2, created_at: "2026-04-10" }, // -18j (hors fenêtre)
          ],
        ],
      ]);
    };

    const result = await runReport(spec, {
      sourceLoader,
      noCache: true,
      now: NOW,
    });

    const rows = result.payload.blocks[0].data as ReadonlyArray<unknown>;
    expect(rows).toHaveLength(1);
  });

  it("retourne narration null si pas de narrationSpec", async () => {
    const spec = buildSpec();
    expect(spec.narration).toBeUndefined();
    const sourceLoader: SourceLoader = async () =>
      new Map([["stripe", [{ amount: 100, currency: "EUR" }]]]);
    const result = await runReport(spec, { sourceLoader, noCache: true });
    expect(result.narration).toBeNull();
  });

  it("appelle alertDispatcher uniquement avec les signaux critical", async () => {
    const spec = buildSpec();
    // Spec qui produit kpi_runway critical (< 6 mois)
    spec.transforms = [
      {
        id: "runway_calc",
        op: "groupBy",
        inputs: ["stripe"],
        params: {
          by: [],
          measures: [{ name: "value", fn: "avg", field: "runway_months" }],
        },
      },
    ];
    spec.blocks = [
      {
        id: "kpi_runway",
        type: "kpi",
        dataRef: "runway_calc",
        layout: { col: 1, row: 0 },
        props: { field: "value" },
      },
    ];

    const sourceLoader: SourceLoader = async () =>
      new Map([["stripe", [{ runway_months: 4 }]]]);

    const dispatcher = vi.fn(async () => ({
      dispatchedSignals: [],
      throttledSignals: [],
      results: [],
      anyDelivered: false,
    }));

    const result = await runReport(spec, {
      sourceLoader,
      noCache: true,
      alertDispatcher: dispatcher,
    });

    expect(dispatcher).toHaveBeenCalledTimes(1);
    type DispatchArg = {
      tenantId: string;
      signals: Array<{ type: string; severity: string }>;
      report: { id: string };
    };
    const calls = dispatcher.mock.calls as unknown as Array<[DispatchArg]>;
    const call = calls[0][0];
    expect(call.tenantId).toBe("t");
    expect(call.signals).toHaveLength(1);
    expect(call.signals[0].type).toBe("runway_risk");
    expect(call.signals[0].severity).toBe("critical");
    expect(call.report.id).toBe(spec.id);
    expect(result.signals[0].type).toBe("runway_risk");
  });

  it("n'appelle PAS alertDispatcher si aucun signal critical", async () => {
    const spec = buildSpec();
    spec.blocks = [
      {
        id: "kpi_runway",
        type: "kpi",
        dataRef: "totals",
        layout: { col: 1, row: 0 },
        props: { field: "mrr" }, // mrr=300, pas un signal runway
      },
    ];

    const sourceLoader: SourceLoader = async () =>
      new Map([["stripe", [{ amount: 300, currency: "EUR" }]]]);

    const dispatcher = vi.fn(async () => ({
      dispatchedSignals: [],
      throttledSignals: [],
      results: [],
      anyDelivered: false,
    }));

    await runReport(spec, {
      sourceLoader,
      noCache: true,
      alertDispatcher: dispatcher,
    });

    expect(dispatcher).not.toHaveBeenCalled();
  });

  it("ignore les exceptions du alertDispatcher (best-effort)", async () => {
    const spec = buildSpec();
    spec.transforms = [
      {
        id: "runway_calc",
        op: "groupBy",
        inputs: ["stripe"],
        params: {
          by: [],
          measures: [{ name: "value", fn: "avg", field: "runway_months" }],
        },
      },
    ];
    spec.blocks = [
      {
        id: "kpi_runway",
        type: "kpi",
        dataRef: "runway_calc",
        layout: { col: 1, row: 0 },
        props: { field: "value" },
      },
    ];

    const sourceLoader: SourceLoader = async () =>
      new Map([["stripe", [{ runway_months: 3 }]]]);

    const dispatcher = vi.fn(async () => {
      throw new Error("boom");
    });

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await runReport(spec, {
        sourceLoader,
        noCache: true,
        alertDispatcher: dispatcher,
      });
      // Le pipeline continue malgré l'exception
      expect(result.signals[0].type).toBe("runway_risk");
    } finally {
      warnSpy.mockRestore();
    }
  });
});
