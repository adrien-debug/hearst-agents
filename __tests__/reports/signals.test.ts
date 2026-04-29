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

// ── Nouveaux signaux V2 ─────────────────────────────────────

describe("extractSignals — expense_spike", () => {
  it("émet expense_spike si current > baseline_3m * 1.3", () => {
    const out = extractSignals(
      payload({
        "kpi_expenses.value": 13_000,
        "kpi_expenses.baseline_3m": 10_000, // 1.3x = 13k → strict
      }),
    );
    expect(out.signals.some((s) => s.type === "expense_spike")).toBe(false);

    const out2 = extractSignals(
      payload({
        "kpi_expenses.value": 14_000,
        "kpi_expenses.baseline_3m": 10_000,
      }),
    );
    const spike = out2.signals.find((s) => s.type === "expense_spike");
    expect(spike).toBeDefined();
    expect(spike?.severity).toBe("critical");
  });

  it("ne tranche pas si baseline absente ou nulle", () => {
    const noBaseline = extractSignals(payload({ "kpi_expenses.value": 99_999 }));
    expect(noBaseline.signals).toHaveLength(0);

    const zeroBaseline = extractSignals(
      payload({ "kpi_expenses.value": 99_999, "kpi_expenses.baseline_3m": 0 }),
    );
    expect(zeroBaseline.signals).toHaveLength(0);
  });
});

describe("extractSignals — retention_drop", () => {
  it("émet si C2 actual < baseline - 5pp", () => {
    const out = extractSignals(
      payload({
        "kpi_retention_c2.value": 0.40,
        "kpi_retention_c2.baseline": 0.50, // drop de 10pp
      }),
    );
    expect(out.signals[0].type).toBe("retention_drop");
    expect(out.signals[0].severity).toBe("critical");
  });

  it("n'émet rien si drop < 5pp", () => {
    const out = extractSignals(
      payload({
        "kpi_retention_c2.value": 0.46,
        "kpi_retention_c2.baseline": 0.50, // 4pp
      }),
    );
    expect(out.signals).toHaveLength(0);
  });

  it("n'émet rien aux seuils exacts (5pp pile)", () => {
    const out = extractSignals(
      payload({
        "kpi_retention_c2.value": 0.45,
        "kpi_retention_c2.baseline": 0.50,
      }),
    );
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — feature_adoption_low", () => {
  it("émet si top_feature_usage < 20% MAU", () => {
    const out = extractSignals(
      payload({
        "kpi_top_feature.value": 100,
        "kpi_top_feature.mau": 1000, // 10%
      }),
    );
    expect(out.signals[0].type).toBe("feature_adoption_low");
    expect(out.signals[0].severity).toBe("warning");
  });

  it("n'émet rien si adoption >= 20%", () => {
    const out = extractSignals(
      payload({
        "kpi_top_feature.value": 250,
        "kpi_top_feature.mau": 1000, // 25%
      }),
    );
    expect(out.signals).toHaveLength(0);
  });

  it("n'émet rien si MAU = 0 (évite division par zéro)", () => {
    const out = extractSignals(
      payload({ "kpi_top_feature.value": 0, "kpi_top_feature.mau": 0 }),
    );
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — nps_decline", () => {
  it("émet si NPS courant < précédent - 10", () => {
    const out = extractSignals(
      payload({ "kpi_nps.value": 30, "kpi_nps.previous": 45 }),
    );
    expect(out.signals[0].type).toBe("nps_decline");
    expect(out.signals[0].severity).toBe("warning");
  });

  it("n'émet rien si drop <= 10", () => {
    const out = extractSignals(
      payload({ "kpi_nps.value": 38, "kpi_nps.previous": 45 }),
    );
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — csat_drop", () => {
  it("émet si CSAT 7j < baseline 30j - 5pp", () => {
    const out = extractSignals(
      payload({ "kpi_csat_7d.value": 0.78, "kpi_csat_7d.baseline": 0.90 }),
    );
    expect(out.signals[0].type).toBe("csat_drop");
    expect(out.signals[0].severity).toBe("warning");
  });

  it("n'émet rien si CSAT 7j >= baseline - 5pp", () => {
    const out = extractSignals(
      payload({ "kpi_csat_7d.value": 0.86, "kpi_csat_7d.baseline": 0.90 }),
    );
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — sla_breach", () => {
  it("émet si compliance < 90%", () => {
    const out = extractSignals(payload({ "kpi_sla.value": 0.85 }));
    expect(out.signals[0].type).toBe("sla_breach");
    expect(out.signals[0].severity).toBe("critical");
  });

  it("n'émet rien si compliance >= 90%", () => {
    const out = extractSignals(payload({ "kpi_sla.value": 0.95 }));
    expect(out.signals).toHaveLength(0);
  });

  it("émet bien à 89.9% (juste sous le seuil)", () => {
    const out = extractSignals(payload({ "kpi_sla.value": 0.899 }));
    expect(out.signals[0].type).toBe("sla_breach");
  });
});

describe("extractSignals — V2 multi-signaux + severity globale", () => {
  it("ramène la severity globale à critical si un seul signal critical V2", () => {
    const out = extractSignals(
      payload({
        "kpi_sla.value": 0.80, // critical sla_breach
        "kpi_top_feature.value": 50,
        "kpi_top_feature.mau": 1000, // warning feature_adoption_low
      }),
    );
    expect(out.signals.length).toBe(2);
    expect(out.severity).toBe("critical");
  });

  it("ignore les rules V2 si scalaires partiels (composite)", () => {
    // Seul value présent, baseline absent → rule composite skip.
    const out = extractSignals(payload({ "kpi_csat_7d.value": 0.5 }));
    expect(out.signals.find((s) => s.type === "csat_drop")).toBeUndefined();
  });
});

// ── Signaux V2.1 — Engineering Velocity / HR-People ─────────

describe("extractSignals — lead_time_drift", () => {
  it("émet si value > baseline * 1.3", () => {
    const out = extractSignals(
      payload({
        "kpi_lead_time.value": 50,
        "kpi_lead_time.baseline": 30, // 1.66x → drift
      }),
    );
    const sig = out.signals.find((s) => s.type === "lead_time_drift");
    expect(sig).toBeDefined();
    expect(sig?.severity).toBe("warning");
  });

  it("n'émet pas exactement au seuil 1.3x (strict)", () => {
    const out = extractSignals(
      payload({
        "kpi_lead_time.value": 39,    // = 30 * 1.3 pile
        "kpi_lead_time.baseline": 30,
      }),
    );
    expect(out.signals.find((s) => s.type === "lead_time_drift")).toBeUndefined();
  });

  it("n'émet pas si baseline absente ou nulle", () => {
    const out1 = extractSignals(payload({ "kpi_lead_time.value": 99 }));
    expect(out1.signals.find((s) => s.type === "lead_time_drift")).toBeUndefined();

    const out2 = extractSignals(
      payload({ "kpi_lead_time.value": 99, "kpi_lead_time.baseline": 0 }),
    );
    expect(out2.signals.find((s) => s.type === "lead_time_drift")).toBeUndefined();
  });

  it("n'émet pas si lead time = baseline", () => {
    const out = extractSignals(
      payload({ "kpi_lead_time.value": 30, "kpi_lead_time.baseline": 30 }),
    );
    expect(out.signals.find((s) => s.type === "lead_time_drift")).toBeUndefined();
  });
});

describe("extractSignals — change_failure_high", () => {
  it("émet critical si CFR > 15%", () => {
    const out = extractSignals(
      payload({ "kpi_change_failure_rate.value": 0.20 }),
    );
    const sig = out.signals.find((s) => s.type === "change_failure_high");
    expect(sig).toBeDefined();
    expect(sig?.severity).toBe("critical");
    expect(out.severity).toBe("critical");
  });

  it("n'émet pas exactement à 15% (strict)", () => {
    const out = extractSignals(
      payload({ "kpi_change_failure_rate.value": 0.15 }),
    );
    expect(out.signals.find((s) => s.type === "change_failure_high")).toBeUndefined();
  });

  it("n'émet pas si CFR < 15%", () => {
    const out = extractSignals(
      payload({ "kpi_change_failure_rate.value": 0.05 }),
    );
    expect(out.signals).toHaveLength(0);
  });

  it("n'émet pas si scalaire manquant", () => {
    const out = extractSignals(payload({}));
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — burnout_risk", () => {
  it("émet warning si late_hours / mau > 30%", () => {
    const out = extractSignals(
      payload({
        "kpi_late_hours.value": 40,
        "kpi_late_hours.mau": 100, // 40% > 30%
      }),
    );
    const sig = out.signals.find((s) => s.type === "burnout_risk");
    expect(sig).toBeDefined();
    expect(sig?.severity).toBe("warning");
    expect(sig?.blockId).toBe("kpi_late_hours");
  });

  it("émet warning si weekend_activity / mau > 20%", () => {
    const out = extractSignals(
      payload({
        "kpi_weekend_activity.value": 25,
        "kpi_weekend_activity.mau": 100, // 25% > 20%
      }),
    );
    const sig = out.signals.find((s) => s.type === "burnout_risk");
    expect(sig).toBeDefined();
    expect(sig?.blockId).toBe("kpi_weekend_activity");
  });

  it("dédup : si late et weekend matchent, un seul burnout_risk émis", () => {
    const out = extractSignals(
      payload({
        "kpi_late_hours.value": 40,
        "kpi_late_hours.mau": 100,
        "kpi_weekend_activity.value": 30,
        "kpi_weekend_activity.mau": 100,
      }),
    );
    const burnouts = out.signals.filter((s) => s.type === "burnout_risk");
    expect(burnouts).toHaveLength(1);
  });

  it("n'émet pas si ratios sous les seuils (composite OR)", () => {
    const out = extractSignals(
      payload({
        "kpi_late_hours.value": 20,    // 20% < 30%
        "kpi_late_hours.mau": 100,
        "kpi_weekend_activity.value": 15, // 15% < 20%
        "kpi_weekend_activity.mau": 100,
      }),
    );
    expect(out.signals.find((s) => s.type === "burnout_risk")).toBeUndefined();
  });

  it("n'émet pas si MAU = 0 (évite division par zéro)", () => {
    const out = extractSignals(
      payload({
        "kpi_late_hours.value": 100,
        "kpi_late_hours.mau": 0,
      }),
    );
    expect(out.signals.find((s) => s.type === "burnout_risk")).toBeUndefined();
  });

  it("composite OR : émet si seul un des deux dépasse", () => {
    // Late OK mais weekend dépasse
    const out = extractSignals(
      payload({
        "kpi_late_hours.value": 10,
        "kpi_late_hours.mau": 100,
        "kpi_weekend_activity.value": 25,
        "kpi_weekend_activity.mau": 100,
      }),
    );
    expect(out.signals.find((s) => s.type === "burnout_risk")).toBeDefined();
  });
});

// ── Signaux V2.2 — incident_spike + burnout_risk via late_activity ──

describe("extractSignals — incident_spike", () => {
  it("émet critical si value > baseline_4w * 1.5", () => {
    // 4 vs 2 → 4 > 2*1.5=3 → strict.
    const out = extractSignals(
      payload({
        "kpi_incidents.value": 4,
        "kpi_incidents.baseline_4w": 2,
      }),
    );
    const sig = out.signals.find((s) => s.type === "incident_spike");
    expect(sig).toBeDefined();
    expect(sig?.severity).toBe("critical");
    expect(out.severity).toBe("critical");
  });

  it("n'émet pas exactement au seuil 1.5x (strict)", () => {
    const out = extractSignals(
      payload({
        "kpi_incidents.value": 3,
        "kpi_incidents.baseline_4w": 2,
      }),
    );
    expect(out.signals.find((s) => s.type === "incident_spike")).toBeUndefined();
  });

  it("n'émet pas si baseline_4w = 0", () => {
    const out = extractSignals(
      payload({
        "kpi_incidents.value": 99,
        "kpi_incidents.baseline_4w": 0,
      }),
    );
    expect(out.signals.find((s) => s.type === "incident_spike")).toBeUndefined();
  });

  it("n'émet pas si baseline_4w manquant", () => {
    const out = extractSignals(payload({ "kpi_incidents.value": 99 }));
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — burnout_risk via late_activity_ratio", () => {
  it("émet warning si kpi_late_activity.value > 0.25", () => {
    const out = extractSignals(payload({ "kpi_late_activity.value": 0.30 }));
    const sig = out.signals.find((s) => s.type === "burnout_risk");
    expect(sig).toBeDefined();
    expect(sig?.severity).toBe("warning");
    expect(sig?.blockId).toBe("kpi_late_activity");
  });

  it("n'émet pas exactement au seuil 0.25 (strict)", () => {
    const out = extractSignals(payload({ "kpi_late_activity.value": 0.25 }));
    expect(out.signals.find((s) => s.type === "burnout_risk")).toBeUndefined();
  });

  it("n'émet pas si ratio < 25%", () => {
    const out = extractSignals(payload({ "kpi_late_activity.value": 0.10 }));
    expect(out.signals).toHaveLength(0);
  });
});

describe("extractSignals — integration : baseline_3m généré par renderBlocks", () => {
  it("financial-pnl rule expense_spike consomme baseline_3m issu d'un transform", async () => {
    // Simule l'intégration end-to-end : un block KPI avec subScalars publie
    // bien le sous-scalaire baseline_3m, qui est consommé par la rule.
    const { renderBlocks } = await import(
      "@/lib/reports/engine/render-blocks"
    );
    const spec = {
      id: "00000000-0000-4000-8000-100000000004",
      version: 1,
      meta: {
        title: "F",
        summary: "",
        domain: "finance" as const,
        persona: "founder" as const,
        cadence: "monthly" as const,
        confidentiality: "internal" as const,
      },
      scope: { tenantId: "t", workspaceId: "w" },
      sources: [
        {
          id: "src",
          kind: "composio" as const,
          spec: { action: "X", params: {} },
        },
      ],
      transforms: [],
      blocks: [
        {
          id: "kpi_expenses",
          type: "kpi" as const,
          label: "Charges",
          dataRef: "src",
          layout: { col: 1 as const, row: 0 },
          props: {
            field: "value",
            subScalars: { baseline_3m: "baseline_3m" },
          },
        },
      ],
      refresh: { mode: "manual" as const, cooldownHours: 0 },
      cacheTTL: { raw: 60, transform: 600, render: 3600 },
      createdAt: 0,
      updatedAt: 0,
    };
    const datasets = new Map([
      ["src", [{ value: 14_000, baseline_3m: 10_000 }]],
    ]);
    const out = renderBlocks(spec, datasets, 0);
    expect(out.scalars["kpi_expenses.value"]).toBe(14_000);
    expect(out.scalars["kpi_expenses.baseline_3m"]).toBe(10_000);

    const signals = extractSignals(out);
    const spike = signals.signals.find((s) => s.type === "expense_spike");
    expect(spike).toBeDefined();
    expect(spike?.severity).toBe("critical");
  });
});
