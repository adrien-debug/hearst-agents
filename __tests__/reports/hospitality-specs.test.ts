/**
 * Tests — hospitality reports specs (3 specs valides Zod + sample data
 * generators consistants).
 */
import { describe, it, expect } from "vitest";
import { reportSpecSchema } from "@/lib/reports/spec/schema";
import {
  buildHospitalityDailyBrief,
  buildHospitalityDailyBriefSampleData,
  HOSPITALITY_DAILY_BRIEF_ID,
  buildHospitalityRevpar,
  buildHospitalityRevparSampleData,
  HOSPITALITY_REVPAR_ID,
  buildHospitalityGuestSatisfaction,
  buildHospitalityGuestSatisfactionSampleData,
  HOSPITALITY_GUEST_SATISFACTION_ID,
  CATALOG,
} from "@/lib/reports/catalog";

const SCOPE = {
  tenantId: "tenant-h",
  workspaceId: "ws-1",
  userId: "user-1",
};

describe("hospitality specs — Zod validation", () => {
  it("Daily Briefing — Hospitality est un Spec valide", () => {
    const spec = buildHospitalityDailyBrief(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
    expect(spec.id).toBe(HOSPITALITY_DAILY_BRIEF_ID);
    expect(spec.meta.title).toContain("Daily Briefing");
  });

  it("RevPAR & ADR — Hospitality est un Spec valide", () => {
    const spec = buildHospitalityRevpar(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
    expect(spec.id).toBe(HOSPITALITY_REVPAR_ID);
    expect(spec.meta.domain).toBe("finance");
  });

  it("Guest Satisfaction — Hospitality est un Spec valide", () => {
    const spec = buildHospitalityGuestSatisfaction(SCOPE);
    expect(() => reportSpecSchema.parse(spec)).not.toThrow();
    expect(spec.id).toBe(HOSPITALITY_GUEST_SATISFACTION_ID);
    expect(spec.meta.domain).toBe("support");
  });

  it("les 3 specs sont enregistrés dans le CATALOG global", () => {
    const ids = CATALOG.map((c) => c.id);
    expect(ids).toContain(HOSPITALITY_DAILY_BRIEF_ID);
    expect(ids).toContain(HOSPITALITY_REVPAR_ID);
    expect(ids).toContain(HOSPITALITY_GUEST_SATISFACTION_ID);
  });

  it("requiredApps contient 'pms' pour les 3 specs hospitality", () => {
    const hospEntries = CATALOG.filter((c) =>
      [
        HOSPITALITY_DAILY_BRIEF_ID,
        HOSPITALITY_REVPAR_ID,
        HOSPITALITY_GUEST_SATISFACTION_ID,
      ].includes(c.id),
    );
    expect(hospEntries).toHaveLength(3);
    for (const e of hospEntries) {
      expect(e.requiredApps).toContain("pms");
    }
  });
});

describe("hospitality specs — sample data generators", () => {
  it("daily brief sample data couvre tous les dataRefs du spec", () => {
    const spec = buildHospitalityDailyBrief(SCOPE);
    const sample = buildHospitalityDailyBriefSampleData();
    const requiredRefs = new Set(spec.blocks.map((b) => b.dataRef));
    for (const ref of requiredRefs) {
      expect(sample).toHaveProperty(ref);
    }
  });

  it("revpar sample data fournit pms_revpar_30d (30 points) + revenue_source", () => {
    const sample = buildHospitalityRevparSampleData();
    expect(sample.pms_revpar_30d.length).toBe(30);
    expect(sample.pms_revenue_source.length).toBeGreaterThan(0);
    expect(sample.pms_revpar_30d[0]).toHaveProperty("date");
    expect(sample.pms_revpar_30d[0]).toHaveProperty("revpar");
  });

  it("guest satisfaction sample data fournit lignes par canal", () => {
    const sample = buildHospitalityGuestSatisfactionSampleData();
    expect(sample.guest_satisfaction.length).toBeGreaterThan(0);
    sample.guest_satisfaction.forEach((row) => {
      expect(row).toHaveProperty("channel");
      expect(row).toHaveProperty("nps");
    });
  });
});
