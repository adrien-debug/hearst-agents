/**
 * Domain Routing Contract Tests
 *
 * Captures the current keyword-based domain routing behavior across
 * the dispersed heuristics: resolveRetrievalMode, getRequiredProvidersForInput,
 * isResearchIntent / isReportIntent.
 *
 * These snapshots protect against regressions when we consolidate
 * all keyword logic into a single capability taxonomy.
 */

import { describe, it, expect } from "vitest";
import { resolveRetrievalMode } from "@/lib/capabilities/taxonomy";
import { getRequiredProvidersForInput } from "@/lib/engine/orchestrator/provider-requirements";
import { isResearchIntent, isReportIntent } from "@/lib/engine/orchestrator/research-intent";

// ── resolveRetrievalMode (replaces detectRetrievalMode) ─────

describe("resolveRetrievalMode — contract", () => {
  const cases: Array<{ input: string; expected: string | null }> = [
    { input: "Montre-moi mes emails récents", expected: "messages" },
    { input: "Show me my inbox", expected: "messages" },
    { input: "Quels sont mes fichiers Drive ?", expected: "documents" },
    { input: "Find my documents", expected: "documents" },
    { input: "Quels sont mes rendez-vous aujourd'hui ?", expected: "structured_data" },
    { input: "What meetings do I have?", expected: "structured_data" },
    { input: "Bonjour, comment ça va ?", expected: null },
    { input: "Fais une recherche sur Bitcoin", expected: null },
  ];

  for (const { input, expected } of cases) {
    it(`"${input.slice(0, 50)}" → ${expected}`, () => {
      expect(resolveRetrievalMode(input)).toBe(expected);
    });
  }
});

// ── getRequiredProvidersForInput ─────────────────────────────

describe("getRequiredProvidersForInput — contract", () => {
  it("email prompt → requires google provider", () => {
    const r = getRequiredProvidersForInput("Montre-moi mes emails");
    expect(r).not.toBeNull();
    expect(r!.providers).toContain("google");
  });

  it("calendar prompt → requires google provider", () => {
    const r = getRequiredProvidersForInput("Mon agenda pour demain");
    expect(r).not.toBeNull();
    expect(r!.providers).toContain("google");
  });

  it("generic prompt → no provider required", () => {
    const r = getRequiredProvidersForInput("Bonjour");
    expect(r).toBeNull();
  });
});

// ── research-intent ─────────────────────────────────────────

describe("isResearchIntent — contract", () => {
  it("detects research keywords", () => {
    expect(isResearchIntent("Fais une recherche sur Bitcoin")).toBe(true);
    expect(isResearchIntent("Analyse du marché crypto")).toBe(true);
    expect(isResearchIntent("Compare les tendances")).toBe(true);
  });

  it("does not detect non-research", () => {
    expect(isResearchIntent("Bonjour")).toBe(false);
    expect(isResearchIntent("Montre-moi mes emails")).toBe(false);
  });
});

describe("isReportIntent — contract", () => {
  it("detects report keywords", () => {
    expect(isReportIntent("Fais-moi un rapport sur Bitcoin")).toBe(true);
    expect(isReportIntent("Rédige une synthèse")).toBe(true);
    expect(isReportIntent("Generate a summary")).toBe(true);
  });

  it("does not detect non-report", () => {
    expect(isReportIntent("Bonjour")).toBe(false);
  });
});
