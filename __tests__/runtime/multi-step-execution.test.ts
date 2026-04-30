/**
 * Mission Control B1 — multi-step execution lifecycle.
 *
 * Couvre :
 * - Step lifecycle : started → completed → costUSD propagé
 * - Approval gate : paused, store reflète awaiting_approval
 * - Plan failed : status reflète l'erreur
 */

import { describe, it, expect, beforeEach } from "vitest";
import { useRuntimeStore } from "@/stores/runtime";

describe("Runtime store — Mission Control plan slice", () => {
  beforeEach(() => {
    useRuntimeStore.setState({ currentPlan: null, events: [] });
  });

  it("plan_preview crée un PlanState avec steps idle", () => {
    useRuntimeStore.getState().addEvent({
      type: "plan_preview",
      run_id: "run_1",
      plan_id: "plan_1",
      intent: "test intent",
      steps: [
        { id: "s1", kind: "analyze", title: "Analyse" },
        { id: "s2", kind: "synthesize", title: "Synthèse" },
      ],
      estimatedCostUsd: 0.02,
      requiredApps: ["calendar"],
    });

    const plan = useRuntimeStore.getState().currentPlan;
    expect(plan).not.toBeNull();
    expect(plan!.id).toBe("plan_1");
    expect(plan!.steps).toHaveLength(2);
    expect(plan!.steps[0].status).toBe("idle");
    expect(plan!.requiredApps).toEqual(["calendar"]);
  });

  it("plan_step_started → step status === running", () => {
    useRuntimeStore.getState().addEvent({
      type: "plan_preview",
      run_id: "run_1",
      plan_id: "plan_1",
      intent: "test",
      steps: [{ id: "s1", kind: "analyze", title: "Analyse" }],
      estimatedCostUsd: 0.01,
      requiredApps: [],
    });

    useRuntimeStore.getState().addEvent({
      type: "plan_step_started",
      run_id: "run_1",
      plan_id: "plan_1",
      step_id: "s1",
      kind: "analyze",
      label: "Analyse",
      plannedAt: Date.now(),
    });

    const plan = useRuntimeStore.getState().currentPlan;
    expect(plan!.status).toBe("running");
    expect(plan!.steps[0].status).toBe("running");
  });

  it("plan_step_completed propage costUSD et output", () => {
    useRuntimeStore.getState().addEvent({
      type: "plan_preview",
      run_id: "run_1",
      plan_id: "plan_1",
      intent: "test",
      steps: [{ id: "s1", kind: "analyze", title: "Analyse" }],
      estimatedCostUsd: 0.01,
      requiredApps: [],
    });

    useRuntimeStore.getState().addEvent({
      type: "plan_step_completed",
      run_id: "run_1",
      plan_id: "plan_1",
      step_id: "s1",
      output: "résultat partiel",
      costUSD: 0.012,
      latencyMs: 450,
      providerId: "anthropic",
    });

    const plan = useRuntimeStore.getState().currentPlan;
    expect(plan!.steps[0].status).toBe("done");
    expect(plan!.steps[0].costUSD).toBe(0.012);
    expect(plan!.steps[0].output).toBe("résultat partiel");
    expect(plan!.totalCostUsd).toBeCloseTo(0.012, 3);
  });

  it("plan_step_awaiting_approval transitionne le coreState", () => {
    useRuntimeStore.getState().addEvent({
      type: "plan_preview",
      run_id: "run_1",
      plan_id: "plan_1",
      intent: "test",
      steps: [{ id: "s1", kind: "deliver", title: "Envoi" }],
      estimatedCostUsd: 0.01,
      requiredApps: [],
    });

    useRuntimeStore.getState().addEvent({
      type: "plan_step_awaiting_approval",
      run_id: "run_1",
      plan_id: "plan_1",
      step_id: "s1",
      preview: "Envoyer email à client@example.com",
      kind: "deliver",
      providerId: "gmail",
    });

    const state = useRuntimeStore.getState();
    expect(state.coreState).toBe("awaiting_approval");
    expect(state.currentPlan!.status).toBe("awaiting_approval");
    expect(state.currentPlan!.steps[0].status).toBe("awaiting_approval");
    expect(state.currentPlan!.steps[0].approvalPreview).toContain("client@example.com");
  });

  it("plan_step_failed marque le plan failed", () => {
    useRuntimeStore.getState().addEvent({
      type: "plan_preview",
      run_id: "run_1",
      plan_id: "plan_1",
      intent: "test",
      steps: [{ id: "s1", kind: "analyze", title: "Analyse" }],
      estimatedCostUsd: 0.01,
      requiredApps: [],
    });

    useRuntimeStore.getState().addEvent({
      type: "plan_step_failed",
      run_id: "run_1",
      plan_id: "plan_1",
      step_id: "s1",
      error: "tool unavailable",
    });

    const plan = useRuntimeStore.getState().currentPlan;
    expect(plan!.status).toBe("failed");
    expect(plan!.steps[0].status).toBe("error");
    expect(plan!.steps[0].error).toBe("tool unavailable");
  });

  it("plan_run_complete totalise le cost", () => {
    useRuntimeStore.getState().addEvent({
      type: "plan_preview",
      run_id: "run_1",
      plan_id: "plan_1",
      intent: "test",
      steps: [],
      estimatedCostUsd: 0.05,
      requiredApps: [],
    });

    useRuntimeStore.getState().addEvent({
      type: "plan_run_complete",
      run_id: "run_1",
      plan_id: "plan_1",
      totalCostUsd: 0.045,
      totalLatencyMs: 12000,
    });

    const plan = useRuntimeStore.getState().currentPlan;
    expect(plan!.status).toBe("completed");
    expect(plan!.totalCostUsd).toBe(0.045);
  });
});
