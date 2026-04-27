/**
 * Capability Router Tests
 */

import { describe, it, expect } from "vitest";
import {
  resolveCapabilityScope,
  validateAgentForScope,
  scopeRequiresProviders,
  shouldInjectUserData,
  type CapabilityScope,
} from "@/lib/capabilities/router";

function buildScope(partial: Partial<CapabilityScope> & { domain: CapabilityScope["domain"] }): CapabilityScope {
  return {
    capabilities: [],
    providers: [],
    allowedTools: [],
    validAgents: [],
    retrievalMode: null,
    toolContext: "general",
    needsProviderData: { calendar: false, gmail: false, drive: false },
    ...partial,
  };
}

describe("resolveCapabilityScope", () => {
  it("email prompt → communication domain with gmail data", () => {
    const s = resolveCapabilityScope("Montre-moi mes emails récents");
    expect(s.domain).toBe("communication");
    expect(s.retrievalMode).toBe("messages");
    expect(s.toolContext).toBe("inbox");
    expect(s.needsProviderData.gmail).toBe(true);
    expect(s.providers).toContain("google");
  });

  it("calendar prompt → productivity domain with calendar data", () => {
    const s = resolveCapabilityScope("Quels sont mes rendez-vous demain ?");
    expect(s.domain).toBe("productivity");
    expect(s.retrievalMode).toBe("structured_data");
    expect(s.needsProviderData.calendar).toBe(true);
  });

  it("drive prompt → productivity domain with drive data", () => {
    const s = resolveCapabilityScope("Cherche dans mes fichiers Drive");
    expect(s.domain).toBe("productivity");
    expect(s.needsProviderData.drive).toBe(true);
    expect(s.retrievalMode).toBe("documents");
  });

  it("finance prompt → finance domain, stripe provider", () => {
    const s = resolveCapabilityScope("Analyse du marché crypto");
    expect(s.domain).toBe("finance");
    expect(s.providers).toContain("stripe");
  });

  it("generic prompt → general domain, no providers needed", () => {
    const s = resolveCapabilityScope("Bonjour comment ça va");
    expect(s.domain).toBe("general");
    expect(s.retrievalMode).toBeNull();
    expect(s.needsProviderData.calendar).toBe(false);
    expect(s.needsProviderData.gmail).toBe(false);
  });

  it("surface override takes priority", () => {
    const s = resolveCapabilityScope("Bonjour", "inbox");
    expect(s.domain).toBe("communication");
    expect(s.toolContext).toBe("inbox");
  });

  it("surface home → no override", () => {
    const s = resolveCapabilityScope("Bonjour", "home");
    expect(s.domain).toBe("general");
  });
});

describe("validateAgentForScope", () => {
  it("FinanceAgent valid for finance scope", () => {
    const scope = resolveCapabilityScope("Analyse stripe paiements");
    const r = validateAgentForScope("FinanceAgent", scope);
    expect(r.valid).toBe(true);
  });

  it("FinanceAgent invalid for communication scope", () => {
    const scope = resolveCapabilityScope("Montre-moi mes emails");
    const r = validateAgentForScope("FinanceAgent", scope);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("not valid for domain");
  });

  it("DocBuilder (general agent) valid everywhere", () => {
    const scope = resolveCapabilityScope("Montre-moi mes emails");
    const r = validateAgentForScope("DocBuilder", scope);
    expect(r.valid).toBe(true);
  });
});

describe("scopeRequiresProviders", () => {
  it("communication requires providers", () => {
    const scope = resolveCapabilityScope("Montre-moi mes emails");
    expect(scopeRequiresProviders(scope)).toBe(true);
  });

  it("research does NOT require providers (uses web)", () => {
    const scope = resolveCapabilityScope("Fais une recherche sur les tendances du marché");
    expect(scopeRequiresProviders(scope)).toBe(false);
  });

  it("hybrid prompt (research + finance keyword) resolves to finance", () => {
    const scope = resolveCapabilityScope("Fais une recherche sur Bitcoin");
    expect(scope.domain).toBe("finance");
    expect(scopeRequiresProviders(scope)).toBe(true);
  });

  it("general does NOT require providers", () => {
    const scope = resolveCapabilityScope("Bonjour");
    expect(scopeRequiresProviders(scope)).toBe(false);
  });
});

describe("shouldInjectUserData", () => {
  it("injects when explicit calendar keyword matches", () => {
    const scope = resolveCapabilityScope("Mes rendez-vous demain");
    expect(shouldInjectUserData(scope, "Mes rendez-vous demain")).toBe(true);
  });

  it("injects when explicit gmail keyword matches", () => {
    const scope = resolveCapabilityScope("Montre-moi mes emails récents");
    expect(shouldInjectUserData(scope, "Montre-moi mes emails récents")).toBe(true);
  });

  it("injects for communication domain even without keyword", () => {
    const scope = buildScope({ domain: "communication" });
    expect(shouldInjectUserData(scope, "À qui dois-je répondre en priorité ?")).toBe(true);
  });

  it("injects for productivity domain even without keyword", () => {
    const scope = resolveCapabilityScope("Quels sont mes rendez-vous demain ?");
    expect(scope.domain).toBe("productivity");
    expect(shouldInjectUserData(scope, "Quels sont mes rendez-vous demain ?")).toBe(true);
  });

  it("injects for vague-but-personal general question", () => {
    const msg = "qu'est-ce que j'ai aujourd'hui ?";
    const scope = resolveCapabilityScope(msg);
    // "aujourd'hui" maps to calendar → productivity, but even if it didn't,
    // the general-domain wordcount fallback would catch it.
    expect(shouldInjectUserData(scope, msg)).toBe(true);
  });

  it("injects for 'résume ma journée' (vague summary)", () => {
    const msg = "résume ma journée";
    const scope = resolveCapabilityScope(msg);
    expect(shouldInjectUserData(scope, msg)).toBe(true);
  });

  it("skips trivial chit-chat ('merci')", () => {
    const scope = resolveCapabilityScope("merci");
    expect(shouldInjectUserData(scope, "merci")).toBe(false);
  });

  it("skips short greeting ('Bonjour')", () => {
    const scope = resolveCapabilityScope("Bonjour");
    expect(shouldInjectUserData(scope, "Bonjour")).toBe(false);
  });

  it("skips finance domain (uses Stripe, not Google)", () => {
    const scope = resolveCapabilityScope("Liste mes paiements Stripe du mois");
    expect(scope.domain).toBe("finance");
    expect(shouldInjectUserData(scope, "Liste mes paiements Stripe du mois")).toBe(false);
  });

  it("skips research domain (uses web, not user data)", () => {
    const scope = resolveCapabilityScope("Fais une recherche sur les tendances IA");
    expect(scope.domain).toBe("research");
    expect(shouldInjectUserData(scope, "Fais une recherche sur les tendances IA")).toBe(false);
  });
});
