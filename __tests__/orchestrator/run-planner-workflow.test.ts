/**
 * Mission Control B1 — run-planner-workflow tests.
 *
 * Couvre :
 * - Détection complex intent (heuristique)
 * - Feature flag isPlannerEnabled
 * - Plan multi-step → events émis dans l'ordre
 * - Plan paused sur approval gate
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isComplexIntent, isPlannerEnabled, runPlannerWorkflow } from "@/lib/engine/orchestrator/run-planner-workflow";
import { RunEventBus } from "@/lib/events/bus";
import type { RunEvent } from "@/lib/events/types";
import { clearAllPlannerStores } from "@/lib/engine/planner/store";

// ── Helpers ─────────────────────────────────────────────────

function makeMockEngine(runId = "run_test_42") {
  return {
    id: runId,
    runId,
    userId: "user_test",
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  } as unknown as Parameters<typeof runPlannerWorkflow>[0];
}

function collectEvents(bus: RunEventBus): RunEvent[] {
  const events: RunEvent[] = [];
  bus.on((e) => {
    events.push(e);
  });
  return events;
}

// ── isComplexIntent ─────────────────────────────────────────

describe("isComplexIntent", () => {
  it("returns false for short messages", () => {
    expect(isComplexIntent("Bonjour")).toBe(false);
    expect(isComplexIntent("Quelle heure est-il ?")).toBe(false);
  });

  it("returns false for long but trivial messages", () => {
    expect(
      isComplexIntent(
        "Voici un message bien plus long que quatre-vingts caractères mais sans aucun mot clé déclencheur particulier ici",
      ),
    ).toBe(false);
  });

  it("returns true for long messages with complex keyword", () => {
    expect(
      isComplexIntent(
        "Prépare le board pack Q2 avec les KPIs commerciaux et les retours clients pour la prochaine réunion",
      ),
    ).toBe(true);
  });

  it("returns true for English board pack request", () => {
    expect(
      isComplexIntent(
        "Please prepare the board pack for Q2 with commercial KPIs and customer feedback for next meeting",
      ),
    ).toBe(true);
  });

  it("returns true for multi-domain hint", () => {
    expect(
      isComplexIntent(
        "Synthétise les emails de la semaine et envoie un résumé sur le canal #equipe-direction immédiatement",
      ),
    ).toBe(true);
  });
});

// ── isPlannerEnabled ────────────────────────────────────────

describe("isPlannerEnabled", () => {
  const original = process.env.HEARST_ENABLE_PLANNER;

  afterEach(() => {
    if (original === undefined) delete process.env.HEARST_ENABLE_PLANNER;
    else process.env.HEARST_ENABLE_PLANNER = original;
  });

  it("returns true when HEARST_ENABLE_PLANNER=true", () => {
    process.env.HEARST_ENABLE_PLANNER = "true";
    expect(isPlannerEnabled()).toBe(true);
  });

  it("returns true when HEARST_ENABLE_PLANNER=1", () => {
    process.env.HEARST_ENABLE_PLANNER = "1";
    expect(isPlannerEnabled()).toBe(true);
  });

  it("returns false when HEARST_ENABLE_PLANNER=false", () => {
    process.env.HEARST_ENABLE_PLANNER = "false";
    expect(isPlannerEnabled()).toBe(false);
  });
});

// ── runPlannerWorkflow ──────────────────────────────────────

describe("runPlannerWorkflow", () => {
  beforeEach(() => {
    clearAllPlannerStores();
  });

  it("emits plan_preview with steps and cost", async () => {
    const bus = new RunEventBus();
    const events = collectEvents(bus);
    const engine = makeMockEngine();

    await runPlannerWorkflow(engine, bus, {
      userId: "user_test",
      tenantId: "tenant_test",
      workspaceId: "ws_test",
      threadId: "thread_test",
      message:
        "Prépare un rapport hebdomadaire à partir des emails et envoie-le au team lead pour validation",
      connectedProviders: [],
    });

    const preview = events.find((e) => e.type === "plan_preview");
    expect(preview).toBeDefined();
    expect((preview as { steps: unknown[] }).steps.length).toBeGreaterThan(0);
    expect((preview as { estimatedCostUsd: number }).estimatedCostUsd).toBeGreaterThanOrEqual(0);
  });

  it("emits plan_step_started + plan_step_completed pour chaque step", async () => {
    const bus = new RunEventBus();
    const events = collectEvents(bus);
    const engine = makeMockEngine();

    await runPlannerWorkflow(engine, bus, {
      userId: "user_test",
      tenantId: "tenant_test",
      workspaceId: "ws_test",
      threadId: "thread_test",
      message: "Analyse cette semaine et synthétise un brief court pour l'équipe",
      connectedProviders: [],
    });

    const started = events.filter((e) => e.type === "plan_step_started");
    const completed = events.filter((e) => e.type === "plan_step_completed");
    expect(started.length).toBeGreaterThan(0);
    expect(completed.length).toBeGreaterThan(0);
  });

  it("emits plan_run_complete with total cost", async () => {
    const bus = new RunEventBus();
    const events = collectEvents(bus);
    const engine = makeMockEngine();

    await runPlannerWorkflow(engine, bus, {
      userId: "user_test",
      tenantId: "tenant_test",
      workspaceId: "ws_test",
      threadId: "thread_test",
      message: "Synthétise les retours clients de la semaine en un brief actionnable",
      connectedProviders: [],
    });

    const complete = events.find((e) => e.type === "plan_run_complete");
    expect(complete).toBeDefined();
    expect((complete as { totalCostUsd: number }).totalCostUsd).toBeGreaterThanOrEqual(0);
  });

  it("emits plan_step_awaiting_approval when intent demande validation", async () => {
    const bus = new RunEventBus();
    const events = collectEvents(bus);
    const engine = makeMockEngine();

    const result = await runPlannerWorkflow(engine, bus, {
      userId: "user_test",
      tenantId: "tenant_test",
      workspaceId: "ws_test",
      threadId: "thread_test",
      // POURQUOI : intent qui DOIT créer une approval gate sans dépendre d'un
      // provider externe : on force "vérifie avant" + analyse pour rester
      // sur des steps internes qui n'ont pas besoin de resolveCapability.
      message:
        "Synthétise un brief pour le board mais vérifie avant de finaliser le rapport stratégique pour validation",
      connectedProviders: [],
    });

    const awaiting = events.find((e) => e.type === "plan_step_awaiting_approval");
    expect(awaiting).toBeDefined();
    expect(result.paused).toBe(true);
  });
});
