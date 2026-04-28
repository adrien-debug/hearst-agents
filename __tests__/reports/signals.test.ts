/**
 * Tests de l'extracteur déterministe de business signals.
 * Garantie : pour un payload donné, on émet toujours la même liste.
 */

import { describe, expect, it } from "vitest";
import { extractSignals } from "@/lib/reports/signals/extract";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";

function payload(scalars: Record<string, unknown>): RenderPayload {
  return {
    __reportPayload: true,
    specId: "00000000-0000-4000-8000-000000000001",
    version: 1,
    generatedAt: 1700000000000,
    blocks: [],
    scalars,
  };
}

describe("extractSignals — MRR", () => {
  it("émet mrr_drop critical si delta <= -0.15", () => {
    const out = extractSignals(payload({ "kpi_mrr.delta": -0.20 }));
    expect(out.signals).toHaveLength(1);
    expect(out.signals[0].type).toBe("mrr_drop");
    expect(out.signals[0].severity).toBe("critical");
    expect(out.severity).toBe("critical");
  });

  it("émet mrr_drop warning si delta entre -0.15 et -0.05", () => {
    const out = extractSignals(payload({ "kpi_mrr.delta": -0.10 }));
    expect(out.signals[0].type).toBe("mrr_drop");
    expect(out.signals[0].severity).toBe("warning");
  });

  it("émet mrr_spike info si delta >= 0.10", () => {
    const out = extractSignals(payload({ "kpi_mrr.delta": 0.15 }));
    expect(out.signals[0].type).toBe("mrr_spike");
  });

  it("n'émet rien si delta entre -0.05 et 0.10", () => {
    const out = extractSignals(payload({ "kpi_mrr.delta": 0.02 }));
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — Runway", () => {
  it("émet runway_risk critical si runway < 6 mois", () => {
    const out = extractSignals(payload({ "kpi_runway.value": 4.5 }));
    expect(out.signals[0].type).toBe("runway_risk");
    expect(out.signals[0].severity).toBe("critical");
  });

  it("émet runway_risk warning si runway entre 6 et 9 mois", () => {
    const out = extractSignals(payload({ "kpi_runway.value": 8 }));
    expect(out.signals[0].severity).toBe("warning");
  });

  it("n'émet rien si runway >= 9 mois", () => {
    const out = extractSignals(payload({ "kpi_runway.value": 18 }));
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — Customer at risk", () => {
  it("émet customer_at_risk si tickets ouverts >= 5", () => {
    const out = extractSignals(payload({ "kpi_tickets.value": 7 }));
    expect(out.signals[0].type).toBe("customer_at_risk");
  });
});

describe("extractSignals — Pipeline", () => {
  it("émet pipeline_thin si valeur < 50k", () => {
    const out = extractSignals(payload({ "kpi_pipeline.value": 30_000 }));
    expect(out.signals[0].type).toBe("pipeline_thin");
  });

  it("n'émet rien si pipeline >= 50k", () => {
    const out = extractSignals(payload({ "kpi_pipeline.value": 200_000 }));
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — multi-signaux et severity globale", () => {
  it("émet plusieurs signaux dans un seul payload", () => {
    const out = extractSignals(
      payload({
        "kpi_mrr.delta": -0.20,        // critical
        "kpi_runway.value": 5,          // critical
        "kpi_pipeline.value": 30_000,   // warning
      }),
    );
    expect(out.signals.length).toBe(3);
    // Severity globale = la plus haute (critical)
    expect(out.severity).toBe("critical");
  });

  it("dédup : un type de signal émis une seule fois max", () => {
    // Même si plusieurs règles MRR matchent, on n'émet pas mrr_drop deux fois
    const out = extractSignals(payload({ "kpi_mrr.delta": -0.30 }));
    const mrrSignals = out.signals.filter((s) => s.type === "mrr_drop");
    expect(mrrSignals).toHaveLength(1);
  });

  it("ignore les scalars manquants ou non-finis", () => {
    const out = extractSignals(
      payload({
        "kpi_mrr.delta": null,
        "kpi_runway.value": NaN,
      }),
    );
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — déterminisme", () => {
  it("même payload → mêmes signaux à chaque call", () => {
    const p = payload({ "kpi_mrr.delta": -0.10, "kpi_pipeline.value": 25_000 });
    const a = extractSignals(p);
    const b = extractSignals(p);
    expect(a).toEqual(b);
  });
});
