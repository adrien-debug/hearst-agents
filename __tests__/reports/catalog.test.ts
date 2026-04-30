/**
 * Vérifie que chaque spec catalogué passe la validation Zod stricte
 * + que la matrice d'applicabilité produit le bon statut.
 */

import { describe, expect, it } from "vitest";
import { reportSpecSchema } from "@/lib/reports/spec/schema";
import {
  CATALOG,
  getApplicableReports,
  buildFounderCockpit,
  buildCustomer360,
  buildDealToCash,
  buildFinancialPnL,
  buildProductAnalytics,
  buildSupportHealth,
  buildEngineeringVelocity,
  buildMarketingAarrr,
  buildHrPeople,
} from "@/lib/reports/catalog";

const SCOPE = {
  tenantId: "dev-tenant",
  workspaceId: "dev-workspace",
  userId: "user-1",
};

describe("catalogue — Zod validation", () => {
  it("Founder Cockpit est un Spec valide", () => {
    const spec = buildFounderCockpit(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Customer 360 est un Spec valide", () => {
    const spec = buildCustomer360(SCOPE, "client@example.com");
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Deal-to-Cash est un Spec valide", () => {
    const spec = buildDealToCash(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Financial P&L est un Spec valide", () => {
    const spec = buildFinancialPnL(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Product Analytics est un Spec valide", () => {
    const spec = buildProductAnalytics(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Support Health est un Spec valide", () => {
    const spec = buildSupportHealth(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Engineering Velocity est un Spec valide", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("Marketing AARRR est un Spec valide", () => {
    const spec = buildMarketingAarrr(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("HR / People est un Spec valide", () => {
    const spec = buildHrPeople(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("le CATALOG expose les 9 entries avec ids stables", () => {
    expect(CATALOG).toHaveLength(9);
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(9); // tous distincts
  });
});

describe("getApplicableReports — matrice connexions", () => {
  it("retourne ready quand toutes les apps sont connectées (Founder)", () => {
    const out = getApplicableReports([
      "stripe",
      "hubspot",
      "gmail",
      "calendar",
      "github",
    ]);
    const founder = out.find((r) => r.title === "Founder Cockpit");
    expect(founder?.status).toBe("ready");
    expect(founder?.missingApps).toHaveLength(0);
  });

  it("retourne partial quand au moins 1 app connectée", () => {
    const out = getApplicableReports(["stripe"]);
    const founder = out.find((r) => r.title === "Founder Cockpit");
    expect(founder?.status).toBe("partial");
    expect(founder?.missingApps.length).toBeGreaterThan(0);
  });

  it("ne propose pas un report sans aucune app connectée (blocked)", () => {
    const out = getApplicableReports([]);
    expect(out).toHaveLength(0);
  });

  it("Deal-to-Cash apparaît dès qu'on connecte HubSpot ou Stripe", () => {
    const out = getApplicableReports(["stripe"]);
    const d2c = out.find((r) => r.title === "Deal-to-Cash");
    expect(d2c).toBeDefined();
    expect(d2c?.status).toBe("partial");
  });

  it("est insensible à la casse", () => {
    const out = getApplicableReports(["HubSpot", "STRIPE"]);
    const d2c = out.find((r) => r.title === "Deal-to-Cash");
    expect(d2c?.status).toBe("ready");
  });

  it("Financial P&L apparaît dès Stripe seul (partial) puis ready avec QuickBooks", () => {
    const partial = getApplicableReports(["stripe"]);
    const fpl1 = partial.find((r) => r.title === "Financial P&L");
    expect(fpl1?.status).toBe("partial");
    expect(fpl1?.missingApps).toContain("quickbooks");

    const ready = getApplicableReports(["stripe", "quickbooks"]);
    const fpl2 = ready.find((r) => r.title === "Financial P&L");
    expect(fpl2?.status).toBe("ready");
    expect(fpl2?.missingApps).toHaveLength(0);
  });

  it("Product Analytics nécessite Mixpanel + Stripe + Intercom", () => {
    const partial = getApplicableReports(["mixpanel"]);
    const pa = partial.find((r) => r.title === "Product Analytics");
    expect(pa?.status).toBe("partial");

    const ready = getApplicableReports(["mixpanel", "stripe", "intercom"]);
    const pa2 = ready.find((r) => r.title === "Product Analytics");
    expect(pa2?.status).toBe("ready");
  });

  it("Support Health est ready dès Intercom connecté", () => {
    const ready = getApplicableReports(["intercom"]);
    const sh = ready.find((r) => r.title === "Support Health");
    expect(sh?.status).toBe("ready");
    expect(sh?.missingApps).toHaveLength(0);
  });

  it("Engineering Velocity est partial avec GitHub seul, ready avec Linear", () => {
    const partial = getApplicableReports(["github"]);
    const ev1 = partial.find((r) => r.title === "Engineering Velocity");
    expect(ev1?.status).toBe("partial");
    expect(ev1?.missingApps).toContain("linear");

    const ready = getApplicableReports(["github", "linear"]);
    const ev2 = ready.find((r) => r.title === "Engineering Velocity");
    expect(ev2?.status).toBe("ready");
    expect(ev2?.missingApps).toHaveLength(0);
  });

  it("Marketing AARRR nécessite Google Analytics + Stripe + HubSpot", () => {
    const partial = getApplicableReports(["googleanalytics"]);
    const ma = partial.find((r) => r.title === "Marketing AARRR");
    expect(ma?.status).toBe("partial");

    const ready = getApplicableReports([
      "googleanalytics",
      "stripe",
      "hubspot",
    ]);
    const ma2 = ready.find((r) => r.title === "Marketing AARRR");
    expect(ma2?.status).toBe("ready");
    expect(ma2?.missingApps).toHaveLength(0);
  });

  it("HR / People nécessite Greenhouse + Slack + BambooHR", () => {
    const partial = getApplicableReports(["slack"]);
    const hr = partial.find((r) => r.title === "HR / People");
    expect(hr?.status).toBe("partial");
    expect(hr?.missingApps).toContain("greenhouse");
    expect(hr?.missingApps).toContain("bamboohr");

    const ready = getApplicableReports(["greenhouse", "slack", "bamboohr"]);
    const hr2 = ready.find((r) => r.title === "HR / People");
    expect(hr2?.status).toBe("ready");
    expect(hr2?.missingApps).toHaveLength(0);
  });
});

describe("catalogue — sous-scalaires consommés par signals", () => {
  /**
   * Vérifie que les blocs KPI exposent bien le sous-scalaire (props.subScalars)
   * attendu par les règles de signals (extract.ts). Sans ces sous-scalaires,
   * les rules composites skip silencieusement et n'émettent rien.
   */
  function findBlock(spec: ReturnType<typeof buildFinancialPnL>, blockId: string) {
    return spec.blocks.find((b) => b.id === blockId);
  }

  it("financial-pnl : kpi_expenses expose baseline_3m", () => {
    const spec = buildFinancialPnL(SCOPE);
    const block = findBlock(spec, "kpi_expenses");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.baseline_3m).toBeDefined();
  });

  it("product-analytics : kpi_top_feature expose mau", () => {
    const spec = buildProductAnalytics(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_top_feature");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.mau).toBeDefined();
  });

  it("product-analytics : kpi_nps expose previous", () => {
    const spec = buildProductAnalytics(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_nps");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.previous).toBeDefined();
  });

  it("product-analytics : kpi_retention_c2 expose baseline", () => {
    const spec = buildProductAnalytics(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_retention_c2");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.baseline).toBeDefined();
  });

  it("support-health : kpi_csat_7d expose baseline", () => {
    const spec = buildSupportHealth(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_csat_7d");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.baseline).toBeDefined();
  });

  it("support-health : kpi_sla expose value en ratio (format percent)", () => {
    const spec = buildSupportHealth(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_sla");
    expect(block).toBeDefined();
    expect(block?.props?.format).toBe("percent");
  });

  it("engineering-velocity : kpi_lead_time expose baseline", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_lead_time");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.baseline).toBeDefined();
  });

  it("engineering-velocity : kpi_change_failure_rate présent (rename de kpi_cfr)", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_change_failure_rate");
    expect(block).toBeDefined();
  });

  it("hr-people : kpi_late_activity expose value en ratio (format percent)", () => {
    const spec = buildHrPeople(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_late_activity");
    expect(block).toBeDefined();
    expect(block?.props?.format).toBe("percent");
    // value = ratio late/total : pas de subScalars requis pour la rule simple.
  });

  it("engineering-velocity : kpi_incidents expose baseline_4w", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_incidents");
    expect(block).toBeDefined();
    const subs = block?.props?.subScalars as Record<string, string>;
    expect(subs.baseline_4w).toBeDefined();
  });

  it("engineering-velocity : kpi_cycle expose deltaField pour cycle_time_drift", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    const block = spec.blocks.find((b) => b.id === "kpi_cycle");
    expect(block).toBeDefined();
    expect(block?.props?.deltaField).toBeDefined();
  });

  it("aucun catalogue ne dépasse MAX_TRANSFORMS = 24", () => {
    const specs = [
      buildFinancialPnL(SCOPE),
      buildProductAnalytics(SCOPE),
      buildSupportHealth(SCOPE),
      buildEngineeringVelocity(SCOPE),
      buildHrPeople(SCOPE),
    ];
    for (const spec of specs) {
      expect(spec.transforms.length).toBeLessThanOrEqual(24);
    }
  });
});

describe("catalogue — TTL cache cohérent avec cadence", () => {
  /**
   * Règle :
   *  - monthly  → render TTL = 86400s (max schema, 24h)
   *  - weekly   → render TTL ≥ 86400s (24h min, 1 run/semaine → cache au moins 1 journée)
   *  - daily    → render TTL ≥ 3600s  (1h min, au moins 1h de cache sur du daily)
   *  - ad-hoc   → pas de contrainte forte
   */
  it("financial-pnl (monthly) → render TTL = 86400s", () => {
    const spec = buildFinancialPnL(SCOPE);
    expect(spec.meta.cadence).toBe("monthly");
    expect(spec.cacheTTL.render).toBe(86400);
  });

  it("engineering-velocity (weekly) → render TTL ≥ 86400s", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    expect(spec.meta.cadence).toBe("weekly");
    expect(spec.cacheTTL.render).toBeGreaterThanOrEqual(86400);
  });

  it("marketing-aarrr (weekly) → render TTL ≥ 86400s", () => {
    const spec = buildMarketingAarrr(SCOPE);
    expect(spec.meta.cadence).toBe("weekly");
    expect(spec.cacheTTL.render).toBeGreaterThanOrEqual(86400);
  });

  it("product-analytics (weekly) → render TTL ≥ 86400s", () => {
    const spec = buildProductAnalytics(SCOPE);
    expect(spec.meta.cadence).toBe("weekly");
    expect(spec.cacheTTL.render).toBeGreaterThanOrEqual(86400);
  });

  it("hr-people (weekly) → render TTL ≥ 86400s", () => {
    const spec = buildHrPeople(SCOPE);
    expect(spec.meta.cadence).toBe("weekly");
    expect(spec.cacheTTL.render).toBeGreaterThanOrEqual(86400);
  });

  it("support-health (daily) → render TTL ≥ 3600s", () => {
    const spec = buildSupportHealth(SCOPE);
    expect(spec.meta.cadence).toBe("daily");
    expect(spec.cacheTTL.render).toBeGreaterThanOrEqual(3600);
  });

  it("tous les specs cacheTTL passent la validation Zod (max render=86400)", () => {
    const allSpecs = [
      buildFounderCockpit(SCOPE),
      buildCustomer360(SCOPE, "client@example.com"),
      buildDealToCash(SCOPE),
      buildFinancialPnL(SCOPE),
      buildProductAnalytics(SCOPE),
      buildSupportHealth(SCOPE),
      buildEngineeringVelocity(SCOPE),
      buildMarketingAarrr(SCOPE),
      buildHrPeople(SCOPE),
    ];
    for (const spec of allSpecs) {
      expect(() => reportSpecSchema.parse(spec)).not.toThrow();
      expect(spec.cacheTTL.render).toBeLessThanOrEqual(86400);
    }
  });
});
