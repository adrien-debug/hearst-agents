/**
 * Tests Zod sur ReportSpec — vérifie que les contraintes structurelles tiennent
 * (DAG cohérent, ids uniques, refs valides, refresh.cron requis si scheduled).
 *
 * C'est le filet de sécurité contre les Specs malformés générés par le LLM.
 */

import { describe, expect, it } from "vitest";
import {
  parseReportSpec,
  safeParseReportSpec,
  reportSpecSchema,
  type ReportSpec,
} from "@/lib/reports/spec/schema";

const SPEC_ID = "00000000-0000-4000-8000-000000000001";

function baseSpec(): ReportSpec {
  return {
    id: SPEC_ID,
    version: 1,
    meta: {
      title: "Founder Cockpit",
      summary: "Vue d'ensemble du business",
      domain: "founder",
      persona: "founder",
      cadence: "daily",
      confidentiality: "internal",
    },
    scope: {
      tenantId: "dev-tenant",
      workspaceId: "dev-workspace",
      userId: "user-1",
    },
    sources: [
      {
        id: "stripe_charges",
        kind: "composio",
        spec: { action: "STRIPE_LIST_CHARGES", params: { limit: 100 } },
      },
    ],
    transforms: [
      {
        id: "mrr_total",
        op: "groupBy",
        inputs: ["stripe_charges"],
        params: {
          by: ["currency"],
          measures: [{ name: "mrr", fn: "sum", field: "amount" }],
        },
      },
    ],
    blocks: [
      {
        id: "kpi_mrr",
        type: "kpi",
        dataRef: "mrr_total",
        layout: { col: 1, row: 0 },
        props: { label: "MRR" },
      },
    ],
    refresh: { mode: "manual", cooldownHours: 0 },
    cacheTTL: { raw: 60, transform: 600, render: 3600 },
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
  };
}

describe("reportSpecSchema — chemin nominal", () => {
  it("accepte un Spec minimal valide", () => {
    const spec = baseSpec();
    expect(() => parseReportSpec(spec)).not.toThrow();
  });

  it("expose les inférences TypeScript correctement", () => {
    const spec = parseReportSpec(baseSpec());
    expect(spec.meta.domain).toBe("founder");
    expect(spec.sources[0].kind).toBe("composio");
  });

  it("applique les défauts (cacheTTL, version, narration absente)", () => {
    const minimal = { ...baseSpec() };
    delete (minimal as Partial<ReportSpec>).cacheTTL;
    const parsed = reportSpecSchema.parse(minimal);
    expect(parsed.cacheTTL).toEqual({ raw: 60, transform: 600, render: 3600 });
  });
});

describe("reportSpecSchema — DAG cohérent", () => {
  it("rejette un block qui référence un dataset inexistant", () => {
    const spec = baseSpec();
    spec.blocks[0].dataRef = "ghost_dataset";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.message.includes("dataset inconnu"))).toBe(
        true,
      );
    }
  });

  it("rejette un transform qui référence un dataset inexistant", () => {
    const spec = baseSpec();
    spec.transforms[0].inputs = ["ghost"];
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });

  it("rejette des ids dupliqués entre sources et transforms", () => {
    const spec = baseSpec();
    spec.transforms[0].id = "stripe_charges"; // collision
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });

  it("rejette des ids dupliqués dans les blocks", () => {
    const spec = baseSpec();
    spec.blocks.push({ ...spec.blocks[0] });
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });
});

describe("reportSpecSchema — refresh", () => {
  it("rejette mode='scheduled' sans cron", () => {
    const spec = baseSpec();
    spec.refresh = { mode: "scheduled", cooldownHours: 0 };
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });

  it("accepte mode='scheduled' avec cron 5 champs", () => {
    const spec = baseSpec();
    spec.refresh = {
      mode: "scheduled",
      cron: "0 8 * * *",
      cooldownHours: 12,
    };
    expect(() => parseReportSpec(spec)).not.toThrow();
  });

  it("rejette un cron mal formé", () => {
    const spec = baseSpec();
    spec.refresh = { mode: "scheduled", cron: "every day", cooldownHours: 0 };
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });
});

describe("reportSpecSchema — sources discriminées", () => {
  it("accepte une source native Google", () => {
    const spec = baseSpec();
    spec.sources = [
      {
        id: "calendar_events",
        kind: "native_google",
        spec: { service: "calendar", op: "events.list", params: {} },
      },
    ];
    spec.transforms = [];
    spec.blocks = [
      {
        id: "list",
        type: "table",
        dataRef: "calendar_events",
        layout: { col: 4, row: 0 },
        props: {},
      },
    ];
    expect(() => parseReportSpec(spec)).not.toThrow();
  });

  it("rejette une source HTTP avec URL malformée", () => {
    const spec = baseSpec();
    spec.sources = [
      {
        id: "weather",
        kind: "http",
        spec: { url: "not a url", method: "GET" },
      },
    ];
    spec.transforms = [];
    spec.blocks[0].dataRef = "weather";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });
});

describe("reportSpecSchema — transforms typés", () => {
  it("accepte un join avec on multi-clés", () => {
    const spec = baseSpec();
    spec.sources.push({
      id: "hubspot_deals",
      kind: "composio",
      spec: { action: "HUBSPOT_LIST_DEALS", params: {} },
    });
    spec.transforms = [
      {
        id: "joined",
        op: "join",
        inputs: ["stripe_charges", "hubspot_deals"],
        params: {
          on: [{ left: "customer_id", right: "id" }],
          how: "inner",
        },
      },
    ];
    spec.blocks[0].dataRef = "joined";
    expect(() => parseReportSpec(spec)).not.toThrow();
  });

  it("accepte un derive avec colonnes nommées", () => {
    const spec = baseSpec();
    spec.transforms.push({
      id: "with_delta",
      op: "derive",
      inputs: ["mrr_total"],
      params: {
        columns: [{ name: "delta_pct", expr: "mrr / 100" }],
      },
    });
    spec.blocks[0].dataRef = "with_delta";
    expect(() => parseReportSpec(spec)).not.toThrow();
  });

  it("rejette un window avec range malformé", () => {
    const spec = baseSpec();
    spec.transforms = [
      {
        id: "windowed",
        op: "window",
        inputs: ["stripe_charges"],
        params: { range: "30 days", field: "created_at" },
      },
    ];
    spec.blocks[0].dataRef = "windowed";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });

  it("rejette une mesure inconnue dans groupBy", () => {
    const spec = baseSpec();
    spec.transforms = [
      {
        id: "agg",
        op: "groupBy",
        inputs: ["stripe_charges"],
        params: {
          by: ["currency"],
          measures: [
            // @ts-expect-error -- on teste qu'un fn invalide est rejeté à runtime
            { name: "wat", fn: "stddev", field: "amount" },
          ],
        },
      },
    ];
    spec.blocks[0].dataRef = "agg";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });
});

describe("reportSpecSchema — limites de taille", () => {
  it("rejette un Spec avec >12 blocks", () => {
    const spec = baseSpec();
    spec.blocks = Array.from({ length: 13 }, (_, i) => ({
      id: `b_${i}`,
      type: "kpi" as const,
      dataRef: "mrr_total",
      layout: { col: 1 as const, row: i },
      props: {},
    }));
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });

  it("rejette un Spec avec >8 sources", () => {
    const spec = baseSpec();
    spec.sources = Array.from({ length: 9 }, (_, i) => ({
      id: `src_${i}`,
      kind: "composio" as const,
      spec: { action: `ACT_${i}`, params: {} },
    }));
    spec.transforms = [];
    spec.blocks[0].dataRef = "src_0";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });
});

describe("reportSpecSchema — ids regex", () => {
  it("rejette un id de source avec majuscules", () => {
    const spec = baseSpec();
    spec.sources[0].id = "Stripe_Charges";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });

  it("rejette un id de source qui commence par un chiffre", () => {
    const spec = baseSpec();
    spec.sources[0].id = "1stripe";
    const result = safeParseReportSpec(spec);
    expect(result.success).toBe(false);
  });
});
