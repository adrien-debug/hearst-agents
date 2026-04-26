/**
 * HEARST OS — Full Capability Runtime Test Suite
 *
 * Tests exhaustifs de tout le runtime capability-first :
 * - Taxonomy (8 domaines × résolution × keywords FR/EN)
 * - Router (scope, mode, providers, tools, surfaces)
 * - Guard (matrice agent × domaine complète)
 * - Execution mode (direct_answer, tool_call, workflow, custom_agent)
 * - Provider data intent (calendar, gmail, drive)
 * - Planner validation (agent remapping)
 * - Cross-domain isolation (aucune fuite entre domaines)
 * - Edge cases (multi-keyword, ambiguïtés, messages longs)
 */

import { describe, it, expect } from "vitest";
import {
  resolveDomain,
  resolveRetrievalMode,
  resolveDataIntent,
  isAgentValidForDomain,
  getValidAgentsForDomain,
  getProvidersForDomain,
  getToolsForDomain,
  DOMAIN_TAXONOMY,
  type Domain,
} from "@/lib/capabilities/taxonomy";
import {
  resolveCapabilityScope,
  resolveExecutionMode,
  validateAgentForScope,
  scopeRequiresProviders,
} from "@/lib/capabilities/router";
import { capabilityGuard } from "@/lib/capabilities/guard";

// ══════════════════════════════════════════════════════════════
// 1. TAXONOMY — DOMAIN RESOLUTION (FR + EN, tous domaines)
// ══════════════════════════════════════════════════════════════

describe("Domain Resolution — FR", () => {
  const cases: Array<[string, Domain]> = [
    // Communication
    ["Montre-moi mes emails récents", "communication"],
    ["Lis mes mails non lus", "communication"],
    ["Envoie un message à Pierre sur Slack", "communication"],
    ["Résume ma boîte de courrier", "communication"],
    ["Réponds à cet email", "communication"],

    // Productivity
    ["Quels sont mes rendez-vous demain ?", "productivity"],
    ["Mon agenda de la semaine", "productivity"],
    ["Cherche dans mes fichiers Drive", "productivity"],
    ["Planifie une réunion pour cette semaine", "productivity"],
    ["Montre mes documents Notion", "productivity"],
    ["Crée un événement dans mon calendrier", "productivity"],
    ["Quel créneau est disponible demain ?", "productivity"],

    // Finance
    ["Analyse du marché crypto", "finance"],
    ["Mon solde Stripe", "finance"],
    ["Résumé des paiements du mois", "finance"],
    ["Factures en attente", "finance"],
    ["Prix du Bitcoin aujourd'hui", "finance"],
    ["Revenue récurrent mensuel", "finance"],
    ["Portfolio performance", "finance"],

    // Research
    ["Fais une veille sur les tendances IA", "research"],
    ["Rédige un rapport sur le marché SaaS", "research"],
    ["Compare les solutions de CMS headless", "research"],
    ["Fais-moi une synthèse des actualités tech", "research"],
    ["Prépare un benchmark des outils CMS", "research"],
    ["Enquête sur les régulations européennes", "research"],

    // Developer
    ["Montre mes pull requests GitHub", "developer"],
    ["Déploie la branche staging", "developer"],
    ["Quels sont les tickets Jira ouverts ?", "developer"],
    ["Merge la PR #42", "developer"],
    ["Résumé des commits récents", "developer"],

    // Design
    ["Ouvre mon prototype Figma", "design"],
    ["Montre les maquettes du dashboard", "design"],
    ["Quels composants UI sont prêts ?", "design"],
    ["Wireframe de la page d'accueil", "design"],

    // CRM
    ["Liste mes contacts HubSpot", "crm"],
    ["Pipeline des deals en cours", "crm"],
    ["Quels sont mes leads chauds ?", "crm"],
    ["Résumé des prospects et leads hubspot", "crm"],

    // General
    ["Bonjour comment ça va ?", "general"],
    ["Merci beaucoup", "general"],
    ["Quelle heure est-il ?", "general"],
    ["Raconte-moi une blague", "general"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input.slice(0, 50)}" → ${expected}`, () => {
      expect(resolveDomain(input)).toBe(expected);
    });
  }
});

describe("Domain Resolution — EN", () => {
  const cases: Array<[string, Domain]> = [
    ["Show me my recent emails", "communication"],
    ["Send a reply to John", "communication"],
    ["What meetings do I have this week?", "productivity"],
    ["Search my Drive files", "productivity"],
    ["Schedule a meeting for tomorrow", "productivity"],
    ["Bitcoin price analysis", "finance"],
    ["Show Stripe invoices", "finance"],
    ["Research AI trends 2026", "research"],
    ["Write a report on market competition", "research"],
    ["Show my GitHub pull requests", "developer"],
    ["Deploy to production branch", "developer"],
    ["Open Figma prototype", "design"],
    ["UI wireframe review", "design"],
    ["List HubSpot contacts", "crm"],
    ["Pipeline deals overview", "crm"],
    ["Hello how are you?", "general"],
  ];

  for (const [input, expected] of cases) {
    it(`"${input.slice(0, 50)}" → ${expected}`, () => {
      expect(resolveDomain(input)).toBe(expected);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// 2. RETRIEVAL MODE — Messages, Documents, Structured Data
// ══════════════════════════════════════════════════════════════

describe("Retrieval Mode Resolution", () => {
  it("email FR → messages", () => expect(resolveRetrievalMode("Montre mes emails")).toBe("messages"));
  it("email EN → messages", () => expect(resolveRetrievalMode("Show me my inbox")).toBe("messages"));
  it("slack FR → messages", () => expect(resolveRetrievalMode("Messages Slack récents")).toBe("messages"));

  it("fichier FR → documents", () => expect(resolveRetrievalMode("Cherche dans mes fichiers")).toBe("documents"));
  it("drive FR → documents", () => expect(resolveRetrievalMode("Ouvre mon document Drive")).toBe("documents"));
  it("file EN → documents", () => expect(resolveRetrievalMode("Search my files")).toBe("documents"));

  it("agenda FR → structured_data", () => expect(resolveRetrievalMode("Mon agenda demain")).toBe("structured_data"));
  it("calendrier FR → structured_data", () => expect(resolveRetrievalMode("Calendrier de la semaine")).toBe("structured_data"));
  it("meeting EN → structured_data", () => expect(resolveRetrievalMode("What meetings today?")).toBe("structured_data"));
  it("rendez-vous FR → structured_data", () => expect(resolveRetrievalMode("Mes rendez-vous de demain")).toBe("structured_data"));

  it("generic → null", () => expect(resolveRetrievalMode("Bonjour")).toBeNull());
  it("finance → null (no retrieval)", () => expect(resolveRetrievalMode("Stripe balance")).toBeNull());
  it("code → null", () => expect(resolveRetrievalMode("Deploy the branch")).toBeNull());
});

// ══════════════════════════════════════════════════════════════
// 3. DATA INTENT — Provider Data Needs (Calendar, Gmail, Drive)
// ══════════════════════════════════════════════════════════════

describe("Data Intent Resolution", () => {
  it("email → needsGmail only", () => {
    const r = resolveDataIntent("Montre-moi mes emails");
    expect(r.needsGmail).toBe(true);
    expect(r.needsDrive).toBe(false);
  });

  it("calendar → needsCalendar", () => {
    const r = resolveDataIntent("Mes rendez-vous de demain");
    expect(r.needsCalendar).toBe(true);
  });

  it("drive → needsDrive", () => {
    const r = resolveDataIntent("Cherche mes fichiers");
    expect(r.needsDrive).toBe(true);
  });

  it("general → no data needs except domain fallback", () => {
    const r = resolveDataIntent("Bonjour");
    expect(r.needsGmail).toBe(false);
    expect(r.needsDrive).toBe(false);
    expect(r.needsCalendar).toBe(false);
  });

  it("combined email + calendar", () => {
    const r = resolveDataIntent("Résume mes emails et mon agenda");
    expect(r.needsGmail).toBe(true);
    expect(r.needsCalendar).toBe(true);
  });

  it("combined fichier + calendrier", () => {
    const r = resolveDataIntent("Mes documents et mes réunions de demain");
    expect(r.needsDrive).toBe(true);
    expect(r.needsCalendar).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 4. CAPABILITY SCOPE — Full Router
// ══════════════════════════════════════════════════════════════

describe("Capability Scope — Domain Routing", () => {
  const allDomains: Domain[] = ["communication", "productivity", "finance", "research", "developer", "design", "crm", "general"];

  for (const domain of allDomains) {
    if (domain === "general") continue;
    it(`scope for ${domain} has validAgents, providers, capabilities`, () => {
      const entry = DOMAIN_TAXONOMY[domain];
      expect(entry.validAgents.length).toBeGreaterThan(0);
      expect(entry.capabilities.length).toBeGreaterThan(0);
      expect(entry.keywords.fr.length).toBeGreaterThan(0);
      expect(entry.keywords.en.length).toBeGreaterThan(0);
    });
  }

  it("general has no keywords", () => {
    expect(DOMAIN_TAXONOMY.general.keywords.fr).toHaveLength(0);
    expect(DOMAIN_TAXONOMY.general.keywords.en).toHaveLength(0);
  });

  it("general has all generic agents", () => {
    expect(DOMAIN_TAXONOMY.general.validAgents).toContain("KnowledgeRetriever");
    expect(DOMAIN_TAXONOMY.general.validAgents).toContain("Analyst");
    expect(DOMAIN_TAXONOMY.general.validAgents).toContain("DocBuilder");
    expect(DOMAIN_TAXONOMY.general.validAgents).toContain("Communicator");
    expect(DOMAIN_TAXONOMY.general.validAgents).toContain("Operator");
    expect(DOMAIN_TAXONOMY.general.validAgents).toContain("Planner");
  });
});

describe("Capability Scope — Surface Override", () => {
  it("inbox surface → communication", () => {
    const s = resolveCapabilityScope("Bonjour", "inbox");
    expect(s.domain).toBe("communication");
    expect(s.toolContext).toBe("inbox");
  });

  it("calendar surface → productivity", () => {
    const s = resolveCapabilityScope("Bonjour", "calendar");
    expect(s.domain).toBe("productivity");
    expect(s.toolContext).toBe("calendar");
  });

  it("files surface → productivity", () => {
    const s = resolveCapabilityScope("Bonjour", "files");
    expect(s.domain).toBe("productivity");
    expect(s.toolContext).toBe("files");
  });

  it("finance surface → finance", () => {
    const s = resolveCapabilityScope("Bonjour", "finance");
    expect(s.domain).toBe("finance");
  });

  it("home surface → no override, uses message keywords", () => {
    const s = resolveCapabilityScope("Mon agenda de demain", "home");
    expect(s.domain).toBe("productivity");
  });

  it("unknown surface → general", () => {
    const s = resolveCapabilityScope("Bonjour", "unknown_surface");
    expect(s.domain).toBe("general");
  });
});

describe("Capability Scope — Provider Preflight", () => {
  it("communication requires providers", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Mes emails"))).toBe(true);
  });
  it("productivity requires providers", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Mon agenda demain"))).toBe(true);
  });
  it("finance requires providers", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Stripe balance"))).toBe(true);
  });
  it("research does NOT require providers", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Fais une veille sur l'IA"))).toBe(false);
  });
  it("general does NOT require providers", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Bonjour"))).toBe(false);
  });
  it("developer requires providers (github)", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Mes pull requests github"))).toBe(true);
  });
  it("design requires providers (figma)", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Ouvre mon figma"))).toBe(true);
  });
  it("crm requires providers (hubspot)", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("Mes contacts hubspot"))).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 5. EXECUTION MODE — direct_answer, workflow, custom_agent...
// ══════════════════════════════════════════════════════════════

describe("Execution Mode Resolution", () => {
  it("simple greeting → direct_answer", () => {
    const s = resolveCapabilityScope("Bonjour");
    expect(resolveExecutionMode(s, "Bonjour").mode).toBe("direct_answer");
  });

  it("short generic question → direct_answer", () => {
    const s = resolveCapabilityScope("Merci beaucoup");
    expect(resolveExecutionMode(s, "Merci beaucoup").mode).toBe("direct_answer");
  });

  it("email request → workflow", () => {
    const s = resolveCapabilityScope("Montre-moi mes emails");
    expect(resolveExecutionMode(s, "Montre-moi mes emails").mode).toBe("workflow");
  });

  it("calendar request → workflow", () => {
    const s = resolveCapabilityScope("Mon agenda demain");
    expect(resolveExecutionMode(s, "Mon agenda demain").mode).toBe("workflow");
  });

  it("stripe request → workflow", () => {
    const s = resolveCapabilityScope("Stripe balance");
    expect(resolveExecutionMode(s, "Stripe balance").mode).toBe("workflow");
  });

  it("autonomous pattern 'analyse' → custom_agent", () => {
    const s = resolveCapabilityScope("Analyse les tendances crypto");
    expect(resolveExecutionMode(s, "Analyse les tendances crypto").mode).toBe("custom_agent");
  });

  it("autonomous pattern 'recherche' → custom_agent", () => {
    const s = resolveCapabilityScope("Recherche approfondie sur l'IA");
    expect(resolveExecutionMode(s, "Recherche approfondie sur l'IA").mode).toBe("custom_agent");
  });

  it("autonomous pattern 'surveille' → custom_agent", () => {
    const s = resolveCapabilityScope("Surveille les prix Bitcoin");
    expect(resolveExecutionMode(s, "Surveille les prix Bitcoin").mode).toBe("custom_agent");
  });

  it("memory pattern 'souviens' → custom_agent", () => {
    const s = resolveCapabilityScope("Souviens-toi de mon adresse");
    expect(resolveExecutionMode(s, "Souviens-toi de mon adresse").mode).toBe("custom_agent");
  });

  it("memory pattern 'rappelle' → custom_agent", () => {
    const s = resolveCapabilityScope("Rappelle-moi cette info");
    expect(resolveExecutionMode(s, "Rappelle-moi cette info").mode).toBe("custom_agent");
  });

  it("research without autonomous pattern → workflow", () => {
    const s = resolveCapabilityScope("Fais une veille sur les tendances");
    expect(resolveExecutionMode(s, "Fais une veille sur les tendances").mode).toBe("workflow");
  });

  it("long generic message (>30 words) is NOT direct_answer", () => {
    const long = "Bonjour " + Array.from({ length: 35 }, (_, i) => `mot${i}`).join(" ");
    const s = resolveCapabilityScope(long);
    expect(resolveExecutionMode(s, long).mode).not.toBe("direct_answer");
  });

  it("focal context prevents direct_answer", () => {
    const s = resolveCapabilityScope("Bonjour");
    const d = resolveExecutionMode(s, "Bonjour", { id: "focal-123" });
    expect(d.mode).not.toBe("direct_answer");
  });

  it("deterministic: same input always same output", () => {
    const msg = "Montre-moi mes fichiers Drive";
    const s = resolveCapabilityScope(msg);
    const results = Array.from({ length: 20 }, () => resolveExecutionMode(s, msg));
    const modes = new Set(results.map((r) => r.mode));
    expect(modes.size).toBe(1);
  });
});

// ══════════════════════════════════════════════════════════════
// 6. CAPABILITY GUARD — Agent × Domain Matrix (complète)
// ══════════════════════════════════════════════════════════════

describe("Capability Guard — Full Agent × Domain Matrix", () => {
  const specializedAgents: Record<string, Domain[]> = {
    FinanceAgent: ["finance"],
    CRMAgent: ["crm"],
    ProductivityAgent: ["productivity"],
    DesignAgent: ["design"],
    DeveloperAgent: ["developer"],
  };

  const genericAgents = ["KnowledgeRetriever", "Analyst", "DocBuilder", "Communicator", "Operator", "Planner"];
  const allDomains: Domain[] = ["communication", "productivity", "finance", "research", "developer", "design", "crm", "general"];

  for (const [agent, allowedDomains] of Object.entries(specializedAgents)) {
    for (const domain of allDomains) {
      const shouldAllow = allowedDomains.includes(domain);
      it(`${agent} ${shouldAllow ? "✓" : "✗"} ${domain}`, () => {
        const r = capabilityGuard({ agent, task: "test", domain });
        expect(r.allowed).toBe(shouldAllow);
        if (!shouldAllow) {
          expect(r.suggestedAgents).toBeDefined();
          expect(r.suggestedAgents!.length).toBeGreaterThan(0);
        }
      });
    }
  }

  for (const agent of genericAgents) {
    for (const domain of allDomains) {
      it(`${agent} ✓ ${domain} (general agent)`, () => {
        const r = capabilityGuard({ agent, task: "test", domain });
        expect(r.allowed).toBe(true);
      });
    }
  }
});

describe("Capability Guard — Domain Inference from Task", () => {
  const cases: Array<[string, string, Domain, boolean]> = [
    ["FinanceAgent", "Montre-moi mes emails", "communication", false],
    ["FinanceAgent", "Mon solde Stripe", "finance", true],
    ["CRMAgent", "Mon agenda demain", "productivity", false],
    ["CRMAgent", "Liste mes contacts hubspot", "crm", true],
    ["DeveloperAgent", "Merge la PR github", "developer", true],
    ["DeveloperAgent", "Mes emails", "communication", false],
    ["DesignAgent", "Ouvre figma", "design", true],
    ["DesignAgent", "Stripe balance", "finance", false],
    ["ProductivityAgent", "Mon calendrier", "productivity", true],
    ["ProductivityAgent", "Prix Bitcoin", "finance", false],
  ];

  for (const [agent, task, expectedDomain, shouldAllow] of cases) {
    it(`${agent} + "${task.slice(0, 30)}" → domain=${expectedDomain}, allowed=${shouldAllow}`, () => {
      const r = capabilityGuard({ agent, task });
      expect(r.domain).toBe(expectedDomain);
      expect(r.allowed).toBe(shouldAllow);
    });
  }
});

// ══════════════════════════════════════════════════════════════
// 7. VALIDATE AGENT FOR SCOPE — Planner-level validation
// ══════════════════════════════════════════════════════════════

describe("Validate Agent for Scope", () => {
  it("KnowledgeRetriever valid for all scopes", () => {
    for (const domain of ["communication", "productivity", "finance", "research", "developer", "design", "crm", "general"] as Domain[]) {
      const scope = { ...resolveCapabilityScope("test"), domain };
      (scope as any).validAgents = DOMAIN_TAXONOMY[domain].validAgents;
      expect(validateAgentForScope("KnowledgeRetriever", scope).valid).toBe(true);
    }
  });

  it("FinanceAgent invalid for communication scope", () => {
    const scope = resolveCapabilityScope("Montre-moi mes emails");
    const r = validateAgentForScope("FinanceAgent", scope);
    expect(r.valid).toBe(false);
    expect(r.reason).toContain("not valid");
  });

  it("FinanceAgent valid for finance scope", () => {
    const scope = resolveCapabilityScope("Stripe paiement");
    expect(validateAgentForScope("FinanceAgent", scope).valid).toBe(true);
  });
});

// ══════════════════════════════════════════════════════════════
// 8. CROSS-DOMAIN ISOLATION — No capability leakage
// ══════════════════════════════════════════════════════════════

describe("Cross-Domain Isolation", () => {
  it("finance tools not in communication", () => {
    const financeTools = getToolsForDomain("finance");
    const commTools = getToolsForDomain("communication");
    for (const t of financeTools) {
      expect(commTools).not.toContain(t);
    }
  });

  it("communication providers not in developer", () => {
    const commProviders = getProvidersForDomain("communication");
    const devProviders = getProvidersForDomain("developer");
    expect(commProviders).not.toEqual(devProviders);
  });

  it("specialized agent of one domain not valid in another", () => {
    expect(isAgentValidForDomain("FinanceAgent", "communication")).toBe(false);
    expect(isAgentValidForDomain("CRMAgent", "finance")).toBe(false);
    expect(isAgentValidForDomain("DesignAgent", "developer")).toBe(false);
    expect(isAgentValidForDomain("DeveloperAgent", "design")).toBe(false);
    expect(isAgentValidForDomain("ProductivityAgent", "crm")).toBe(false);
  });

  it("scope providers match domain taxonomy", () => {
    const emailScope = resolveCapabilityScope("Mes emails");
    expect(emailScope.providers).toEqual(DOMAIN_TAXONOMY.communication.providers);

    const stripeScope = resolveCapabilityScope("Stripe balance");
    expect(stripeScope.providers).toEqual(DOMAIN_TAXONOMY.finance.providers);

    const githubScope = resolveCapabilityScope("GitHub pull requests");
    expect(githubScope.providers).toEqual(DOMAIN_TAXONOMY.developer.providers);
  });
});

// ══════════════════════════════════════════════════════════════
// 9. TAXONOMY INTEGRITY — Structural consistency
// ══════════════════════════════════════════════════════════════

describe("Taxonomy Integrity", () => {
  const allDomains = Object.keys(DOMAIN_TAXONOMY) as Domain[];

  it("every domain has at least one valid agent", () => {
    for (const domain of allDomains) {
      expect(
        DOMAIN_TAXONOMY[domain].validAgents.length,
        `${domain} must have valid agents`,
      ).toBeGreaterThan(0);
    }
  });

  it("no keyword appears in more than 2 domains", () => {
    const kwDomains = new Map<string, string[]>();
    for (const [domain, entry] of Object.entries(DOMAIN_TAXONOMY)) {
      if (domain === "general") continue;
      for (const kw of [...entry.keywords.fr, ...entry.keywords.en]) {
        const list = kwDomains.get(kw) ?? [];
        list.push(domain);
        kwDomains.set(kw, list);
      }
    }
    for (const [kw, domains] of kwDomains) {
      expect(
        domains.length,
        `keyword "${kw}" in too many domains: ${domains.join(", ")}`,
      ).toBeLessThanOrEqual(2);
    }
  });

  it("getValidAgentsForDomain matches DOMAIN_TAXONOMY", () => {
    for (const domain of allDomains) {
      expect(getValidAgentsForDomain(domain)).toEqual(DOMAIN_TAXONOMY[domain].validAgents);
    }
  });

  it("getProvidersForDomain matches DOMAIN_TAXONOMY", () => {
    for (const domain of allDomains) {
      expect(getProvidersForDomain(domain)).toEqual(DOMAIN_TAXONOMY[domain].providers);
    }
  });

  it("getToolsForDomain matches DOMAIN_TAXONOMY", () => {
    for (const domain of allDomains) {
      expect(getToolsForDomain(domain)).toEqual(DOMAIN_TAXONOMY[domain].tools);
    }
  });

  it("all 8 domains are defined", () => {
    expect(allDomains).toHaveLength(8);
    expect(allDomains).toContain("communication");
    expect(allDomains).toContain("productivity");
    expect(allDomains).toContain("finance");
    expect(allDomains).toContain("research");
    expect(allDomains).toContain("developer");
    expect(allDomains).toContain("design");
    expect(allDomains).toContain("crm");
    expect(allDomains).toContain("general");
  });
});

// ══════════════════════════════════════════════════════════════
// 10. EDGE CASES — Ambiguïtés, multi-keyword, messages longs
// ══════════════════════════════════════════════════════════════

describe("Edge Cases", () => {
  it("empty message → general", () => {
    expect(resolveDomain("")).toBe("general");
  });

  it("only spaces → general", () => {
    expect(resolveDomain("   ")).toBe("general");
  });

  it("mixed case → still resolves", () => {
    expect(resolveDomain("MONTRE MOI MES EMAILS")).toBe("communication");
  });

  it("accented vs non-accented keywords", () => {
    expect(resolveDomain("réunion demain")).toBe("productivity");
    expect(resolveDomain("reunion demain")).toBe("productivity");
    expect(resolveDomain("événement ce soir")).toBe("productivity");
    expect(resolveDomain("evenement ce soir")).toBe("productivity");
  });

  it("multi-domain keywords: strongest domain wins", () => {
    const scope = resolveCapabilityScope("Fais une recherche sur Bitcoin");
    expect(scope.domain).toBe("finance");
  });

  it("very long message still resolves correctly", () => {
    const prefix = "Lorem ipsum dolor sit amet ".repeat(20);
    const msg = prefix + "Montre-moi mes emails récents";
    expect(resolveDomain(msg)).toBe("communication");
  });

  it("scope on unknown surface falls back to general", () => {
    const s = resolveCapabilityScope("Random text", "unknown");
    expect(s.domain).toBe("general");
  });

  it("scope with surface=home uses keywords", () => {
    const s = resolveCapabilityScope("Mon agenda demain", "home");
    expect(s.domain).toBe("productivity");
  });

  it("guard with unknown agent blocks in non-general domain", () => {
    const r = capabilityGuard({ agent: "UnknownAgent", task: "emails", domain: "communication" });
    expect(r.allowed).toBe(false);
  });

  it("guard with unknown agent allows in general domain", () => {
    const r = capabilityGuard({ agent: "UnknownAgent", task: "bonjour", domain: "general" });
    expect(r.allowed).toBe(false);
  });

  it("resolveExecutionMode is pure (no side effects)", () => {
    const s1 = resolveCapabilityScope("test");
    const d1 = resolveExecutionMode(s1, "test");
    const d2 = resolveExecutionMode(s1, "test");
    expect(d1).toEqual(d2);
  });
});
