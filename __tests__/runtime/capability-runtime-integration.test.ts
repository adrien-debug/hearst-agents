/**
 * HEARST OS — Capability runtime integration & contract tests
 *
 * Mocks externes uniquement (Anthropic, tokens, agents spécialisés, PlanStore).
 * Les modules @/lib/capabilities/* ne sont pas mockés.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunEvent } from "@/lib/events/types";

import {
  DOMAIN_TAXONOMY,
  getValidAgentsForDomain,
  isAgentValidForDomain,
  type Domain,
} from "@/lib/capabilities/taxonomy";
import {
  resolveCapabilityScope,
  resolveExecutionMode,
  scopeRequiresProviders,
} from "@/lib/capabilities/router";
import { capabilityGuard } from "@/lib/capabilities/guard";
import { getRequiredProvidersForInput, getBlockedReasonForProviders } from "@/lib/engine/orchestrator/provider-requirements";
import { isResearchIntent, isReportIntent } from "@/lib/engine/orchestrator/research-intent";
import {
  analyzeTask,
  selectBackend,
  scoreBackends,
} from "@/lib/agents/backend-v2/selector";
import { BACKEND_CAPABILITIES } from "@/lib/agents/backend-v2/types";

const hoisted = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  getTokensMock: vi.fn(),
  createPlanSpy: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = {
      create: hoisted.messagesCreate,
    };
    beta = {
      messages: {
        create: hoisted.messagesCreate,
      },
    };
  },
}));

vi.mock("@/lib/platform/auth/tokens", () => ({
  getTokens: hoisted.getTokensMock,
}));


vi.mock("@/lib/engine/runtime/plans/store", () => ({
  PlanStore: class {
    createPlan = hoisted.createPlanSpy;
    constructor(_db: unknown) {}
  },
}));

import { delegate } from "@/lib/engine/runtime/delegate/api";
import { planFromIntent } from "@/lib/engine/orchestrator/planner";

// ── A — Capability Router ───────────────────────────────────

const DOMAIN_SURFACES: Record<Domain, { surface?: string; message: string }> = {
  communication: { surface: "inbox", message: "x" },
  productivity: { surface: "calendar", message: "x" },
  finance: { surface: "finance", message: "x" },
  research: { surface: "research", message: "x" },
  developer: { message: "corrige ma pull request github" },
  design: { message: "ouvre ma maquette figma" },
  crm: { message: "liste mes leads hubspot" },
  general: { surface: "home", message: "bonjour" },
};

describe("A — Capability Router", () => {
  const domains = Object.keys(DOMAIN_TAXONOMY) as Domain[];

  it.each(domains)("resolveCapabilityScope(%s) aligne domain, capabilities, tools, agents", (domain) => {
    const { surface, message } = DOMAIN_SURFACES[domain];
    const scope = resolveCapabilityScope(message, surface);
    expect(scope.domain).toBe(domain);
    const entry = DOMAIN_TAXONOMY[domain];
    expect(scope.capabilities).toEqual(entry.capabilities);
    expect(scope.providers).toEqual(entry.providers);
    expect(scope.allowedTools).toEqual(entry.tools);
    expect(scope.validAgents).toEqual(entry.validAgents);
    expect(scope.needsProviderData).toEqual(
      expect.objectContaining({
        calendar: expect.any(Boolean),
        gmail: expect.any(Boolean),
        drive: expect.any(Boolean),
      }),
    );
  });

  it("surfaces inbox, calendar, files, finance, home", () => {
    expect(resolveCapabilityScope("anything", "inbox").domain).toBe("communication");
    expect(resolveCapabilityScope("anything", "calendar").domain).toBe("productivity");
    expect(resolveCapabilityScope("anything", "files").domain).toBe("productivity");
    expect(resolveCapabilityScope("anything", "finance").domain).toBe("finance");
    expect(resolveCapabilityScope("bonjour", "home").domain).toBe("general");
  });

  it("scopeRequiresProviders: false pour general et research", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("bonjour", "home"))).toBe(false);
    expect(scopeRequiresProviders(resolveCapabilityScope("veille sectorielle", "research"))).toBe(false);
  });

  it("scopeRequiresProviders: true pour communication / finance", () => {
    expect(scopeRequiresProviders(resolveCapabilityScope("x", "inbox"))).toBe(true);
    expect(scopeRequiresProviders(resolveCapabilityScope("x", "finance"))).toBe(true);
  });

  it("resolveExecutionMode: Bonjour → direct_answer", () => {
    const scope = resolveCapabilityScope("Bonjour", "home");
    const d = resolveExecutionMode(scope, "Bonjour");
    expect(d.mode).toBe("direct_answer");
  });

  it("resolveExecutionMode: Mes emails → workflow (providers)", () => {
    const scope = resolveCapabilityScope("Mes emails non lus", "inbox");
    const d = resolveExecutionMode(scope, "Mes emails non lus");
    expect(d.mode).toBe("workflow");
  });

  it("resolveExecutionMode: Analyse X → custom_agent (autonomous pattern)", () => {
    const scope = resolveCapabilityScope("Analyse le marché", "home");
    const d = resolveExecutionMode(scope, "Analyse le marché");
    expect(d.mode).toBe("custom_agent");
  });
});

// ── B — Capability Guard ─────────────────────────────────────

const SPECIALIZED = ["FinanceAgent", "CRMAgent", "ProductivityAgent", "DesignAgent", "DeveloperAgent"] as const;
const GENERIC = ["KnowledgeRetriever", "Analyst", "DocBuilder", "Communicator", "Operator", "Planner"] as const;

describe("B — Capability Guard", () => {
  it.each(SPECIALIZED)("spécialisé %s × 8 domaines (matrice)", (agent) => {
    const domains = Object.keys(DOMAIN_TAXONOMY) as Domain[];
    for (const domain of domains) {
      const r = capabilityGuard({ agent, task: "contexte neutre", domain });
      const expectedAllowed = isAgentValidForDomain(agent, domain);
      expect(r.allowed).toBe(expectedAllowed);
      if (r.allowed === false) {
        expect(r.suggestedAgents.length).toBeGreaterThan(0);
      }
    }
  });

  it.each(GENERIC)("générique %s × 8 domaines — génériques autorisés partout (taxonomie)", (agent) => {
    const domains = Object.keys(DOMAIN_TAXONOMY) as Domain[];
    for (const domain of domains) {
      const r = capabilityGuard({ agent, task: "x", domain });
      expect(r.allowed).toBe(true);
    }
  });

  it("inférence domaine depuis le texte sans domain explicite", () => {
    const r = capabilityGuard({ agent: "FinanceAgent", task: "Montre mes emails récents" });
    expect(r.domain).toBe("communication");
    expect(r.allowed).toBe(false);
    if (r.allowed === false) {
      expect(r.suggestedAgents.length).toBeGreaterThan(0);
    }
  });
});

// ── C — Planner validation (mock LLM + PlanStore) ───────────

describe("C — Planner validation (remapping agents)", () => {
  const mockDb = {} as SupabaseClient;
  const mockEngine = {
    id: "run-planner-test",
    cost: { track: vi.fn().mockResolvedValue(undefined) },
    attachPlanId: vi.fn().mockResolvedValue(undefined),
  } as unknown as import("@/lib/engine/runtime/engine").RunEngine;

  beforeEach(() => {
    hoisted.messagesCreate.mockReset();
    hoisted.createPlanSpy.mockReset();
    hoisted.createPlanSpy.mockResolvedValue({
      id: "plan-1",
      run_id: mockEngine.id,
      reasoning: "ok",
      steps: [
        {
          id: "st-1",
          plan_id: "plan-1",
          order: 1,
          intent: "test",
          agent: "KnowledgeRetriever",
          task_description: "t",
          expected_output: "summary",
          status: "pending" as const,
          run_step_id: null,
          completed_at: null,
        },
      ],
    });
  });

  it("remappe un agent invalide pour le domaine vers le premier agent valide", async () => {
    hoisted.messagesCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "tu1",
          name: "create_plan",
          input: {
            reasoning: "r",
            steps: [
              {
                intent: "Lire emails",
                agent: "FinanceAgent",
                task_description: "t",
                expected_output: "summary",
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await planFromIntent(mockDb, mockEngine, "emails", [], undefined, "communication");

    expect(hoisted.createPlanSpy).toHaveBeenCalled();
    const [, , steps] = hoisted.createPlanSpy.mock.calls[0] as [string, string, Array<{ agent: string }>];
    expect(steps[0].agent).toBe("KnowledgeRetriever");
  });

  it("ne remappe pas si l’agent est valide pour le domaine", async () => {
    hoisted.messagesCreate.mockResolvedValue({
      content: [
        {
          type: "tool_use",
          id: "tu1",
          name: "create_plan",
          input: {
            reasoning: "r",
            steps: [
              {
                intent: "Synthèse",
                agent: "Analyst",
                task_description: "t",
                expected_output: "report",
              },
            ],
          },
        },
      ],
      usage: { input_tokens: 10, output_tokens: 5 },
    });

    await planFromIntent(mockDb, mockEngine, "stripe", [], undefined, "finance");

    const [, , steps] = hoisted.createPlanSpy.mock.calls[0] as [string, string, Array<{ agent: string }>];
    expect(steps[0].agent).toBe("Analyst");
  });

  it("cohérence isAgentValidForDomain / getValidAgentsForDomain", () => {
    for (const domain of Object.keys(DOMAIN_TAXONOMY) as Domain[]) {
      for (const a of getValidAgentsForDomain(domain)) {
        expect(isAgentValidForDomain(a, domain)).toBe(true);
      }
    }
  });
});

// ── D — Delegate routing (mock engine + spécialisés) ───────

function createMockEngine(runId = "run-delegate-test") {
  const emitted: RunEvent[] = [];
  let stepSeq = 0;
  return {
    id: runId,
    db: {} as SupabaseClient,
    getUserId: () => "user-test",
    events: {
      emit: vi.fn((e: RunEvent) => {
        emitted.push(e);
      }),
    },
    emitted,
    steps: {
      create: vi.fn(async (input: Record<string, unknown>) => {
        stepSeq += 1;
        return { id: `step-${stepSeq}`, ...input };
      }),
      transition: vi.fn().mockResolvedValue(undefined),
      complete: vi.fn().mockResolvedValue(undefined),
      fail: vi.fn().mockResolvedValue(undefined),
    },
    cost: {
      track: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("D — Delegate routing", () => {
  beforeEach(() => {
    hoisted.messagesCreate.mockReset();
    hoisted.getTokensMock.mockReset();
    hoisted.getTokensMock.mockResolvedValue(null);
    hoisted.messagesCreate.mockResolvedValue({
      content: [{ type: "text", text: "Réponse mock" }],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
  });

  it("agent invalide pour le domaine → PERMISSION_DENIED + step_failed + runtime_warning", async () => {
    const engine = createMockEngine();
    const res = await delegate(engine as never, {
      run_id: engine.id,
      agent: "FinanceAgent",
      task: "emails",
      context: { capability_domain: "communication" },
      expected_output: "summary",
    });
    expect(res.status).toBe("error");
    if (res.status === "error") {
      expect(res.error.code).toBe("PERMISSION_DENIED");
    }
    const types = engine.emitted.map((e) => e.type);
    expect(types).toContain("runtime_warning");
    expect(types).toContain("step_failed");
  });
});

// ── E — Backend selector ───────────────────────────────────

describe("E — Backend selector (v2)", () => {
  it("analyzeTask: fichier / code / vision / computer use", () => {
    const file = analyzeTask({ prompt: "Cherche ce document PDF dans mon drive" });
    expect(file.needsFileSearch).toBe(true);

    const code = analyzeTask({ prompt: "Calcule avec Python ce CSV json" });
    expect(code.needsCodeInterpreter).toBe(true);

    const vision = analyzeTask({ prompt: "Décris cette image screenshot" });
    expect(vision.needsVision).toBe(true);

    const cu = analyzeTask({ prompt: "Clique sur le bouton login et remplis le formulaire" });
    expect(cu.needsComputerUse).toBe(true);
  });

  it("selectBackend: recherche fichiers → openai_assistants", () => {
    const r = selectBackend({ prompt: "Search for PDF documents about sales" }, {});
    expect(r.selectedBackend).toBe("openai_assistants");
  });

  it("scoreBackends: ordre décroissant par score", () => {
    const analysis = analyzeTask({ prompt: "simple hello" });
    const ranked = scoreBackends(analysis, BACKEND_CAPABILITIES, {});
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].score).toBeGreaterThanOrEqual(ranked[i + 1].score);
    }
  });

  it("forceBackend bypass le scoring", () => {
    const r = selectBackend(
      { prompt: "n’importe quelle tâche complexe avec fichiers et code" },
      { forceBackend: "openai_responses" },
    );
    expect(r.selectedBackend).toBe("openai_responses");
    expect(r.routingDecision).toBe("forced");
    expect(r.confidence).toBe(1);
  });

  it("priorités cost / speed / quality modifient les scores (pas toujours le même ordre)", () => {
    const analysis = analyzeTask(
      { prompt: "Discuss this long project context" },
      [{ role: "user", content: "hi" }],
    );
    const byPriority = {
      cost: scoreBackends(analysis, BACKEND_CAPABILITIES, { priority: "cost" }),
      speed: scoreBackends(analysis, BACKEND_CAPABILITIES, { priority: "speed" }),
      quality: scoreBackends(analysis, BACKEND_CAPABILITIES, { priority: "quality" }),
      balanced: scoreBackends(analysis, BACKEND_CAPABILITIES, { priority: "balanced" }),
    };
    const scoreOf = (list: typeof byPriority.cost, backend: string) =>
      list.find((s) => s.backend === backend)?.score ?? -1;
    const resp = "openai_responses";
    expect(scoreOf(byPriority.cost, resp)).toBeGreaterThan(scoreOf(byPriority.quality, resp));
    expect(byPriority.speed[0].score).toBeGreaterThanOrEqual(byPriority.speed[1]?.score ?? 0);
    expect(byPriority.balanced.length).toBeGreaterThan(0);
  });
});

// ── F — Provider requirements ───────────────────────────────

describe("F — Provider requirements", () => {
  it("mes emails → google", () => {
    const r = getRequiredProvidersForInput("mes emails de hier");
    expect(r).not.toBeNull();
    expect(r!.providers).toContain("google");
  });

  it("mon agenda → google", () => {
    const r = getRequiredProvidersForInput("mon agenda demain");
    expect(r).not.toBeNull();
    expect(r!.providers).toContain("google");
  });

  it("stripe balance: pas de provider connectable dans le registry (comportement réel)", () => {
    expect(getRequiredProvidersForInput("stripe balance")).toBeNull();
  });

  it("bonjour → null", () => {
    expect(getRequiredProvidersForInput("bonjour")).toBeNull();
  });

  it("getBlockedReasonForProviders lisible", () => {
    const msg = getBlockedReasonForProviders(["google"]);
    expect(msg.toLowerCase()).toContain("google");
    expect(msg.toLowerCase()).toContain("connect");
  });
});

// ── G — Research intent ─────────────────────────────────────

describe("G — Research intent", () => {
  it("isResearchIntent Fais une recherche sur l’IA → true", () => {
    expect(isResearchIntent("Fais une recherche sur l’IA")).toBe(true);
  });
  it("isResearchIntent Bonjour → false", () => {
    expect(isResearchIntent("Bonjour")).toBe(false);
  });
  it("isReportIntent Rédige un rapport → true", () => {
    expect(isReportIntent("Rédige un rapport")).toBe(true);
  });
  it("isReportIntent Mes emails → false", () => {
    expect(isReportIntent("Mes emails")).toBe(false);
  });
});

// ── H — SSE event types (contract) ─────────────────────────

describe("H — SSE / RunEvent contract", () => {
  const required = [
    "step_started",
    "step_completed",
    "step_failed",
    "text_delta",
    "runtime_warning",
    "execution_mode_selected",
    "agent_selected",
    "capability_blocked",
    "orchestrator_log",
    "run_completed",
    "run_failed",
  ] as const;

  it.each(required)("type %s présent sur RunEvent", (t) => {
    const _: RunEvent["type"] = t;
    expect(_).toBe(t);
  });
});

// ── I — Cross-cutting ───────────────────────────────────────

describe("I — Cross-cutting", () => {
  it("déterminisme resolveCapabilityScope (100×)", () => {
    const msg = "Montre mes fichiers sur le drive";
    const first = JSON.stringify(resolveCapabilityScope(msg));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(resolveCapabilityScope(msg))).toBe(first);
    }
  });

  it("isolation: outils finance absents du domaine communication", () => {
    const comm = DOMAIN_TAXONOMY.communication.tools;
    const fin = DOMAIN_TAXONOMY.finance.tools;
    for (const t of fin) {
      expect(comm).not.toContain(t);
    }
  });

  it("keyword overlap: aucun mot-clé taxonomy dans plus de 2 domaines (hors general)", () => {
    const domains = (Object.keys(DOMAIN_TAXONOMY) as Domain[]).filter((d) => d !== "general");
    const kwToDomains = new Map<string, Set<Domain>>();
    for (const d of domains) {
      const { fr, en } = DOMAIN_TAXONOMY[d].keywords;
      for (const k of [...fr, ...en]) {
        const key = k.toLowerCase();
        if (!kwToDomains.has(key)) kwToDomains.set(key, new Set());
        kwToDomains.get(key)!.add(d);
      }
    }
    const violations: string[] = [];
    for (const [kw, set] of kwToDomains) {
      if (set.size > 2) violations.push(`${kw} → ${[...set].join(",")}`);
    }
    expect(violations, `Mots-clés partagés par >2 domaines: ${violations.join(" | ")}`).toEqual([]);
  });

  it("guard: si bloqué, suggestedAgents = agents du domaine", () => {
    const r = capabilityGuard({ agent: "DeveloperAgent", domain: "crm", task: "x" });
    expect(r.allowed).toBe(false);
    if (r.allowed === false) {
      expect(r.suggestedAgents).toEqual(getValidAgentsForDomain("crm"));
    }
  });

  it("modes: Bonjour / emails / Analyse (cohérence router)", () => {
    expect(resolveExecutionMode(resolveCapabilityScope("Bonjour", "home"), "Bonjour").mode).toBe("direct_answer");
    expect(resolveExecutionMode(resolveCapabilityScope("Mes emails", "inbox"), "Mes emails").mode).toBe("workflow");
    expect(resolveExecutionMode(resolveCapabilityScope("Analyse le Q4", "home"), "Analyse le Q4").mode).toBe("custom_agent");
  });
});
