import { describe, it, expect } from "vitest";
import type { ModelDecision } from "../../lib/llm/router";

/**
 * Unit tests for the smart routing decision logic.
 * We test buildDecision behavior indirectly via the exported interface shape,
 * and verify the model selector integration via selectModel.
 */
import { selectModel, type ModelScore } from "../../lib/decisions/model-selector";

function makeScore(overrides: Partial<ModelScore> = {}): ModelScore {
  return {
    profile_id: "p-1",
    provider: "openai",
    model: "gpt-4",
    score: 0.8,
    rank: 1,
    reliability: "stable",
    flags: [],
    stats: { total_calls: 50, success_rate: 0.95, avg_latency_ms: 1200, avg_cost_usd: 0.01 },
    ...overrides,
  };
}

function buildDecisionFromSelection(
  selection: ReturnType<typeof selectModel>,
  scores: ModelScore[],
  goal: "reliability" | "speed" | "cost" | "balanced",
  originalProvider: string,
  originalModel: string,
): ModelDecision {
  const selected = selection.selected;
  const selectedProvider = selected?.provider ?? originalProvider;
  const selectedModel = selected?.model ?? originalModel;

  return {
    selected_provider: selectedProvider,
    selected_model: selectedModel,
    selected_score: selected?.score ?? 0,
    selected_reliability: selected?.reliability ?? "unknown",
    goal,
    reason: selection.reason,
    fallback_count: selection.fallbacks.length,
    fallbacks: selection.fallbacks.map((f) => ({
      provider: f.provider,
      model: f.model,
      score: f.score,
    })),
    scores_considered: scores.length,
    original_provider: originalProvider,
    original_model: originalModel,
    was_overridden: selected
      ? selectedProvider !== originalProvider.toLowerCase() || selectedModel !== originalModel
      : false,
  };
}

describe("smart-router decision building", () => {
  it("marks was_overridden=false when agent model matches selection", () => {
    const scores = [
      makeScore({ profile_id: "p-1", provider: "openai", model: "gpt-4", score: 0.9 }),
      makeScore({ profile_id: "p-2", provider: "anthropic", model: "claude-3", score: 0.7 }),
    ];
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "openai", "gpt-4");

    expect(decision.was_overridden).toBe(false);
    expect(decision.selected_provider).toBe("openai");
    expect(decision.selected_model).toBe("gpt-4");
  });

  it("marks was_overridden=true when selection differs from agent", () => {
    const scores = [
      makeScore({ profile_id: "p-1", provider: "anthropic", model: "claude-3", score: 0.95 }),
      makeScore({ profile_id: "p-2", provider: "openai", model: "gpt-4", score: 0.7 }),
    ];
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "openai", "gpt-4");

    expect(decision.was_overridden).toBe(true);
    expect(decision.selected_provider).toBe("anthropic");
    expect(decision.original_provider).toBe("openai");
  });

  it("falls back to agent model when all models are unstable", () => {
    const scores = [
      makeScore({ reliability: "unstable" }),
    ];
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "openai", "gpt-4");

    expect(decision.selected_provider).toBe("openai");
    expect(decision.selected_model).toBe("gpt-4");
    expect(decision.was_overridden).toBe(false);
  });

  it("includes fallbacks in decision", () => {
    const scores = Array.from({ length: 5 }, (_, i) =>
      makeScore({ profile_id: `p-${i}`, provider: `prov-${i}`, model: `model-${i}`, score: 1 - i * 0.1 }),
    );
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "prov-0", "model-0");

    expect(decision.fallback_count).toBe(3);
    expect(decision.fallbacks).toHaveLength(3);
  });

  it("records the correct goal in decision", () => {
    const scores = [makeScore()];
    const selection = selectModel(scores, "cost");
    const decision = buildDecisionFromSelection(selection, scores, "cost", "openai", "gpt-4");

    expect(decision.goal).toBe("cost");
  });

  it("records scores_considered accurately", () => {
    const scores = Array.from({ length: 4 }, (_, i) =>
      makeScore({ profile_id: `p-${i}`, score: 0.9 - i * 0.1 }),
    );
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "openai", "gpt-4");

    expect(decision.scores_considered).toBe(4);
  });
});

describe("smart chain construction", () => {
  it("always includes agent original model as final fallback", () => {
    const scores = [
      makeScore({ provider: "anthropic", model: "claude-3", score: 0.95 }),
      makeScore({ provider: "openai", model: "gpt-4o", score: 0.8 }),
    ];
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "openai", "gpt-4");

    const chain: Array<{ provider: string; model: string }> = [];
    chain.push({ provider: decision.selected_provider, model: decision.selected_model });
    for (const fb of decision.fallbacks) {
      const key = `${fb.provider}/${fb.model}`;
      if (key !== `${decision.selected_provider}/${decision.selected_model}`) {
        chain.push({ provider: fb.provider, model: fb.model });
      }
    }
    const origKey = `${decision.original_provider}/${decision.original_model}`;
    if (!chain.some((c) => `${c.provider}/${c.model}` === origKey)) {
      chain.push({ provider: decision.original_provider, model: decision.original_model });
    }

    const lastEntry = chain[chain.length - 1];
    expect(`${lastEntry.provider}/${lastEntry.model}`).toBe("openai/gpt-4");
  });

  it("does not duplicate agent model if already in chain", () => {
    const scores = [
      makeScore({ provider: "openai", model: "gpt-4", score: 0.95 }),
    ];
    const selection = selectModel(scores, "balanced");
    const decision = buildDecisionFromSelection(selection, scores, "balanced", "openai", "gpt-4");

    const chain: Array<{ provider: string; model: string }> = [];
    chain.push({ provider: decision.selected_provider, model: decision.selected_model });
    const origKey = `${decision.original_provider}/${decision.original_model}`;
    if (!chain.some((c) => `${c.provider}/${c.model}` === origKey)) {
      chain.push({ provider: decision.original_provider, model: decision.original_model });
    }

    expect(chain).toHaveLength(1);
  });
});
