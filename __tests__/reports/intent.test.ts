/**
 * Tests du détecteur d'intent "report".
 * Le détecteur doit éviter les faux positifs (rapporter, signaler).
 */

import { describe, expect, it } from "vitest";
import { detectReportIntent } from "@/lib/reports/spec/intent";

describe("detectReportIntent — vrais positifs FR", () => {
  it.each([
    "fais-moi un rapport sur le pipeline",
    "donne-moi un cockpit founder",
    "synthèse mensuelle des ventes",
    "synthèse hebdo",
    "tableau de bord finance",
    "vue d'ensemble du business",
    "bilan trimestriel",
    "montre-moi les KPI",
    "fais un dashboard de l'équipe",
    "vue 360 du client",
  ])('détecte "%s"', (msg) => {
    const r = detectReportIntent(msg);
    expect(r.isReport).toBe(true);
    expect(r.matched.length).toBeGreaterThan(0);
  });
});

describe("detectReportIntent — vrais positifs EN", () => {
  it.each([
    "make me a report on Q3 revenue",
    "give me a dashboard view",
    "summary report of last week",
    "I need an overview",
  ])('détecte "%s"', (msg) => {
    expect(detectReportIntent(msg).isReport).toBe(true);
  });
});

describe("detectReportIntent — faux positifs (négatifs)", () => {
  it.each([
    "rapporte ça à Pierre",
    "tu peux te rapporter à la doc",
    "signale un bug à l'équipe",
    "report a bug here",
  ])('rejette "%s"', (msg) => {
    expect(detectReportIntent(msg).isReport).toBe(false);
  });
});

describe("detectReportIntent — non-report messages", () => {
  it.each([
    "envoie un email à Alice",
    "qu'est-ce que tu en penses ?",
    "comment va le MRR ?",
    "",
  ])('rejette "%s"', (msg) => {
    expect(detectReportIntent(msg).isReport).toBe(false);
  });
});
