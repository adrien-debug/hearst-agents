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

  it("le CATALOG expose les 3 entries avec ids stables", () => {
    expect(CATALOG).toHaveLength(3);
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(3); // tous distincts
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
});
