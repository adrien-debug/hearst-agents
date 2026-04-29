/**
 * Tests des nouveaux personas et domaines dans les catalogues.
 *
 * Couvre :
 *  - engineering-velocity → persona "engineering" valide Zod
 *  - marketing-aarrr → persona "marketing" valide Zod
 *  - hr-people → persona "people" + domain "people" valide Zod
 *  - Backward compat : "eng" est toujours valide (aucune régression)
 *  - Tous les nouveaux personas passent la validation Zod
 *  - Tous les nouveaux domaines passent la validation Zod
 */

import { describe, expect, it } from "vitest";
import {
  reportSpecSchema,
  reportMetaSchema,
  REPORT_PERSONAS,
  REPORT_DOMAINS,
} from "@/lib/reports/spec/schema";
import {
  buildEngineeringVelocity,
  buildMarketingAarrr,
  buildHrPeople,
} from "@/lib/reports/catalog";

const SCOPE = {
  tenantId: "dev-tenant",
  workspaceId: "dev-workspace",
  userId: "user-1",
};

// ── Catalogues mis à jour ────────────────────────────────────

describe("catalogues — personas corrects", () => {
  it("engineering-velocity → persona='engineering'", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    expect(spec.meta.persona).toBe("engineering");
  });

  it("marketing-aarrr → persona='marketing'", () => {
    const spec = buildMarketingAarrr(SCOPE);
    expect(spec.meta.persona).toBe("marketing");
  });

  it("hr-people → persona='people'", () => {
    const spec = buildHrPeople(SCOPE);
    expect(spec.meta.persona).toBe("people");
  });

  it("hr-people → domain='people'", () => {
    const spec = buildHrPeople(SCOPE);
    expect(spec.meta.domain).toBe("people");
  });
});

describe("catalogues — Zod valide avec nouveaux personas/domains", () => {
  it("engineering-velocity passe la validation Zod avec persona='engineering'", () => {
    const spec = buildEngineeringVelocity(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("marketing-aarrr passe la validation Zod avec persona='marketing'", () => {
    const spec = buildMarketingAarrr(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });

  it("hr-people passe la validation Zod avec persona='people' + domain='people'", () => {
    const spec = buildHrPeople(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
  });
});

// ── Backward compat ──────────────────────────────────────────

describe("backward compat — 'eng' reste valide", () => {
  it("REPORT_PERSONAS contient encore 'eng'", () => {
    expect(REPORT_PERSONAS).toContain("eng");
  });

  it("reportMetaSchema accepte persona='eng'", () => {
    const meta = {
      title: "Test",
      summary: "",
      domain: "ops-eng",
      persona: "eng",
      cadence: "weekly",
      confidentiality: "internal",
    };
    expect(() => reportMetaSchema.parse(meta)).not.toThrow();
  });
});

// ── Nouveaux personas ────────────────────────────────────────

describe("nouveaux personas Zod", () => {
  const newPersonas = [
    "engineering",
    "marketing",
    "people",
    "finance",
    "product",
    "support",
  ] as const;

  for (const persona of newPersonas) {
    it(`persona '${persona}' est dans REPORT_PERSONAS`, () => {
      expect(REPORT_PERSONAS).toContain(persona);
    });

    it(`reportMetaSchema accepte persona='${persona}'`, () => {
      const meta = {
        title: `Test ${persona}`,
        summary: "",
        domain: "ops",
        persona,
        cadence: "weekly",
        confidentiality: "internal",
      };
      expect(() => reportMetaSchema.parse(meta)).not.toThrow();
    });
  }
});

// ── Nouveaux domaines ────────────────────────────────────────

describe("nouveaux domaines Zod", () => {
  const newDomains = ["people", "marketing"] as const;

  for (const domain of newDomains) {
    it(`domaine '${domain}' est dans REPORT_DOMAINS`, () => {
      expect(REPORT_DOMAINS).toContain(domain);
    });

    it(`reportMetaSchema accepte domain='${domain}'`, () => {
      const meta = {
        title: `Test ${domain}`,
        summary: "",
        domain,
        persona: "ops",
        cadence: "weekly",
        confidentiality: "internal",
      };
      expect(() => reportMetaSchema.parse(meta)).not.toThrow();
    });
  }
});
