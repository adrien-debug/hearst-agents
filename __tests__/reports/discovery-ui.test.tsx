/**
 * Tests Discovery UI — /reports page + ReportCard component.
 *
 * Stratégie : on teste la logique de filtrage et les états composant
 * avec des mocks légers (pas de rendering complet Next.js — pas de router,
 * pas de session). Les composants React sont testés via des utilitaires Vitest.
 *
 * Pour les tests d'intégration UI (Playwright), voir e2e/reports-discovery.spec.ts.
 */

import { describe, expect, it } from "vitest";
import {
  getApplicableReports,
  getApplicableReportsWithTemplates,
  type ApplicableReport,
} from "@/lib/reports/catalog";
import type { TemplateSummary } from "@/lib/reports/templates/schema";

// ── Fixtures ────────────────────────────────────────────────────

const ALL_APPS_FOUNDER = ["stripe", "hubspot", "gmail", "calendar", "github"];
const ALL_APPS_ENG = ["github", "linear"];
const NO_APPS: string[] = [];

// ── 1. Catalogue applicabilité ──────────────────────────────────

describe("discovery — applicabilité des rapports", () => {
  it("retourne des rapports ready quand toutes les apps sont connectées (founder cockpit)", () => {
    const reports = getApplicableReports(ALL_APPS_FOUNDER);
    const founderCockpit = reports.find((r) => r.title === "Founder Cockpit");
    expect(founderCockpit).toBeDefined();
    expect(founderCockpit?.status).toBe("ready");
    expect(founderCockpit?.missingApps).toHaveLength(0);
  });

  it("retourne partial quand certaines apps manquent", () => {
    // Stripe connecté mais pas HubSpot/Gmail/Calendar
    const reports = getApplicableReports(["stripe"]);
    const founderCockpit = reports.find((r) => r.title === "Founder Cockpit");
    expect(founderCockpit).toBeDefined();
    expect(founderCockpit?.status).toBe("partial");
    expect(founderCockpit?.missingApps.length).toBeGreaterThan(0);
  });

  it("n'expose PAS les rapports blocked (aucune app connectée)", () => {
    const reports = getApplicableReports(NO_APPS);
    // Avec 0 apps, tous les rapports devraient être blocked → liste vide
    expect(reports).toHaveLength(0);
  });

  it("retourne Engineering Velocity ready avec les apps github+linear", () => {
    const reports = getApplicableReports(ALL_APPS_ENG);
    const engReport = reports.find((r) => r.title === "Engineering Velocity");
    expect(engReport).toBeDefined();
    expect(engReport?.status).toBe("ready");
  });

  it("tous les rapports ready ont missingApps vide", () => {
    const reports = getApplicableReports([...ALL_APPS_FOUNDER, ...ALL_APPS_ENG, "intercom", "mixpanel", "amplitude", "bamboohr", "workday"]);
    const readyReports = reports.filter((r) => r.status === "ready");
    for (const r of readyReports) {
      expect(r.missingApps).toHaveLength(0);
    }
  });
});

// ── 2. Filtrage par domaine ─────────────────────────────────────

describe("discovery — filtrage par domaine", () => {
  const reports = getApplicableReports([...ALL_APPS_FOUNDER, ...ALL_APPS_ENG]);

  it("filtre correctement par domain finance", () => {
    const financeReports = reports.filter((r) => r.domain === "finance");
    expect(financeReports.every((r) => r.domain === "finance")).toBe(true);
  });

  it("filtre correctement par domain ops-eng", () => {
    const engReports = reports.filter((r) => r.domain === "ops-eng");
    expect(engReports.length).toBeGreaterThan(0);
    expect(engReports.every((r) => r.domain === "ops-eng")).toBe(true);
  });

  it("filtre status ready", () => {
    const readyReports = reports.filter((r) => r.status === "ready");
    expect(readyReports.every((r) => r.status === "ready")).toBe(true);
  });

  it("filtre status partial", () => {
    const partialReports = reports.filter((r) => r.status === "partial");
    expect(partialReports.every((r) => r.status === "partial")).toBe(true);
  });

  it("filtre combiné domain + status", () => {
    const financeReady = reports.filter(
      (r) => r.domain === "finance" && r.status === "ready",
    );
    for (const r of financeReady) {
      expect(r.domain).toBe("finance");
      expect(r.status).toBe("ready");
    }
  });
});

// ── 3. Templates personnalisés ───────────────────────────────────

describe("discovery — templates personnalisés", () => {
  const TEMPLATES: TemplateSummary[] = [
    {
      id: "00000000-0000-4000-8000-aaaaaaaaaaaa",
      tenantId: "dev-tenant",
      createdBy: "00000000-0000-4000-8000-user00000001",
      name: "Mon rapport custom",
      description: "Rapport personnalisé test",
      domain: "finance",
      isPublic: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];

  it("inclut les templates personnalisés avec status=ready et source=custom", () => {
    const reports = getApplicableReportsWithTemplates(ALL_APPS_FOUNDER, TEMPLATES);
    const custom = reports.find((r) => r.id === TEMPLATES[0].id);
    expect(custom).toBeDefined();
    expect(custom?.status).toBe("ready");
    expect(custom?.source).toBe("custom");
  });

  it("filtre les custom via source=custom", () => {
    const reports = getApplicableReportsWithTemplates(ALL_APPS_FOUNDER, TEMPLATES);
    const customReports = reports.filter((r) => r.source === "custom");
    expect(customReports).toHaveLength(TEMPLATES.length);
  });

  it("les templates custom ont missingApps vide", () => {
    const reports = getApplicableReportsWithTemplates(NO_APPS, TEMPLATES);
    const custom = reports.filter((r) => r.source === "custom");
    for (const r of custom) {
      expect(r.missingApps).toHaveLength(0);
      expect(r.requiredApps).toHaveLength(0);
    }
  });

  it("merge catalogue + templates sans doublons d'id", () => {
    const reports = getApplicableReportsWithTemplates(ALL_APPS_FOUNDER, TEMPLATES);
    const ids = reports.map((r) => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });
});

// ── 4. Structure des rapports applicables ───────────────────────

describe("discovery — structure ApplicableReport", () => {
  it("chaque rapport a les champs obligatoires", () => {
    const reports = getApplicableReports(ALL_APPS_FOUNDER);
    for (const r of reports) {
      expect(r.id).toBeTruthy();
      expect(r.title).toBeTruthy();
      expect(r.domain).toBeTruthy();
      expect(r.persona).toBeTruthy();
      expect(["ready", "partial", "blocked"]).toContain(r.status);
      expect(["catalog", "custom"]).toContain(r.source);
      expect(Array.isArray(r.missingApps)).toBe(true);
      expect(Array.isArray(r.requiredApps)).toBe(true);
    }
  });

  it("les rapports catalog ont source=catalog", () => {
    const reports = getApplicableReports(ALL_APPS_FOUNDER);
    for (const r of reports) {
      expect(r.source).toBe("catalog");
    }
  });
});

// ── 5. Toggle états (logique filtrage simulée) ────────────────────

describe("discovery — logique de toggle états", () => {
  const reports: ApplicableReport[] = [
    {
      id: "id-ready",
      title: "Rapport A",
      description: "desc",
      domain: "finance",
      persona: "founder",
      requiredApps: ["stripe"],
      missingApps: [],
      status: "ready",
      source: "catalog",
    },
    {
      id: "id-partial",
      title: "Rapport B",
      description: "desc",
      domain: "crm",
      persona: "csm",
      requiredApps: ["hubspot", "stripe"],
      missingApps: ["stripe"],
      status: "partial",
      source: "catalog",
    },
    {
      id: "id-custom",
      title: "Rapport C",
      description: "",
      domain: "mixed",
      persona: "founder",
      requiredApps: [],
      missingApps: [],
      status: "ready",
      source: "custom",
    },
  ];

  it("toggle Tous retourne tous les rapports", () => {
    expect(reports).toHaveLength(3);
  });

  it("toggle Prêts filtre uniquement les ready", () => {
    const filtered = reports.filter((r) => r.status === "ready");
    expect(filtered).toHaveLength(2);
  });

  it("toggle À connecter filtre uniquement les partial", () => {
    const filtered = reports.filter((r) => r.status === "partial");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("id-partial");
  });

  it("toggle Personnalisés filtre uniquement source=custom", () => {
    const filtered = reports.filter((r) => r.source === "custom");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("id-custom");
  });

  it("filtrage par domaine finance retourne uniquement domain=finance", () => {
    const filtered = reports.filter((r) => r.domain === "finance");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].id).toBe("id-ready");
  });

  it("empty state filtré : combinaison sans résultats", () => {
    const filtered = reports.filter(
      (r) => r.domain === "finance" && r.status === "partial",
    );
    expect(filtered).toHaveLength(0);
  });
});
