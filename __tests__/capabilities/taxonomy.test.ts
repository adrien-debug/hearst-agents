/**
 * Capability Taxonomy Tests
 *
 * Validates that the canonical taxonomy resolvers produce
 * results compatible with the existing dispersed heuristics.
 */

import { describe, it, expect } from "vitest";
import {
  resolveDomain,
  resolveRetrievalMode,
  resolveDataIntent,
  isAgentValidForDomain,
  getProvidersForDomain,
  DOMAIN_TAXONOMY,
} from "@/lib/capabilities/taxonomy";

// ── resolveDomain ───────────────────────────────────────────

describe("resolveDomain", () => {
  it("email prompt → communication", () => {
    expect(resolveDomain("Montre-moi mes emails récents")).toBe("communication");
  });

  it("calendar prompt → productivity", () => {
    expect(resolveDomain("Mon agenda pour demain")).toBe("productivity");
  });

  it("drive prompt → productivity", () => {
    expect(resolveDomain("Cherche dans mes fichiers Drive")).toBe("productivity");
  });

  it("finance prompt → finance", () => {
    expect(resolveDomain("Analyse du marché crypto")).toBe("finance");
  });

  it("research prompt → research", () => {
    expect(resolveDomain("Fais une recherche sur les tendances")).toBe("research");
  });

  it("github prompt → developer", () => {
    expect(resolveDomain("Montre mes pull requests github")).toBe("developer");
  });

  it("figma prompt → design", () => {
    expect(resolveDomain("Ouvre mon prototype figma")).toBe("design");
  });

  it("hubspot prompt → crm", () => {
    expect(resolveDomain("Liste mes contacts hubspot")).toBe("crm");
  });

  it("generic prompt → general", () => {
    expect(resolveDomain("Bonjour comment ça va")).toBe("general");
  });
});

// ── resolveRetrievalMode — backward compatibility ───────────

describe("resolveRetrievalMode — backward compat with detectRetrievalMode", () => {
  it("email → messages", () => {
    expect(resolveRetrievalMode("Montre-moi mes emails récents")).toBe("messages");
  });

  it("drive → documents", () => {
    expect(resolveRetrievalMode("Quels sont mes fichiers Drive ?")).toBe("documents");
  });

  it("calendar → structured_data", () => {
    expect(resolveRetrievalMode("Quels sont mes rendez-vous aujourd'hui ?")).toBe("structured_data");
  });

  it("generic → null", () => {
    expect(resolveRetrievalMode("Bonjour comment ça va")).toBeNull();
  });
});

// ── resolveDataIntent — backward compat with detectDataIntent ──

describe("resolveDataIntent — backward compat", () => {
  it("email → needsGmail", () => {
    const r = resolveDataIntent("Montre-moi mes emails");
    expect(r.needsGmail).toBe(true);
  });

  it("calendar → needsCalendar", () => {
    const r = resolveDataIntent("Quels sont mes rendez-vous demain ?");
    expect(r.needsCalendar).toBe(true);
  });

  it("drive → needsDrive", () => {
    const r = resolveDataIntent("Cherche dans mes fichiers Drive");
    expect(r.needsDrive).toBe(true);
  });
});

// ── Agent validation ────────────────────────────────────────

describe("isAgentValidForDomain", () => {
  it("KnowledgeRetriever valid for communication", () => {
    expect(isAgentValidForDomain("KnowledgeRetriever", "communication")).toBe(true);
  });

  it("FinanceAgent valid for finance", () => {
    expect(isAgentValidForDomain("FinanceAgent", "finance")).toBe(true);
  });

  it("FinanceAgent NOT valid for communication", () => {
    expect(isAgentValidForDomain("FinanceAgent", "communication")).toBe(false);
  });

  it("DeveloperAgent NOT valid for finance", () => {
    expect(isAgentValidForDomain("DeveloperAgent", "finance")).toBe(false);
  });

  it("general agents are valid everywhere", () => {
    expect(isAgentValidForDomain("DocBuilder", "finance")).toBe(true);
    expect(isAgentValidForDomain("Analyst", "communication")).toBe(true);
  });
});

// ── Taxonomy integrity ──────────────────────────────────────

describe("taxonomy integrity", () => {
  it("every domain has at least one valid agent", () => {
    for (const [domain, entry] of Object.entries(DOMAIN_TAXONOMY)) {
      expect(entry.validAgents.length, `${domain} must have valid agents`).toBeGreaterThan(0);
    }
  });

  it("no keyword appears in more than 2 domains", () => {
    const keywordDomains = new Map<string, string[]>();
    for (const [domain, entry] of Object.entries(DOMAIN_TAXONOMY)) {
      if (domain === "general") continue;
      for (const kw of [...entry.keywords.fr, ...entry.keywords.en]) {
        const list = keywordDomains.get(kw) ?? [];
        list.push(domain);
        keywordDomains.set(kw, list);
      }
    }
    for (const [kw, domains] of keywordDomains) {
      expect(domains.length, `keyword "${kw}" in too many domains: ${domains.join(", ")}`).toBeLessThanOrEqual(2);
    }
  });

  it("google provider is in communication and productivity", () => {
    expect(getProvidersForDomain("communication")).toContain("google");
    expect(getProvidersForDomain("productivity")).toContain("google");
  });

  it("stripe provider is only in finance", () => {
    expect(getProvidersForDomain("finance")).toContain("stripe");
    expect(getProvidersForDomain("communication")).not.toContain("stripe");
    expect(getProvidersForDomain("productivity")).not.toContain("stripe");
  });
});
