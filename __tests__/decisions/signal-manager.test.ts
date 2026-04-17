import { describe, it, expect } from "vitest";
import { persistSignals, listSignals, resolveSignal, acknowledgeSignal } from "@/lib/decisions/signal-manager";
import { createMockSupabase } from "../runtime/mock-supabase";
import type { FeedbackSignal } from "@/lib/analytics/feedback";

function makeSb() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return createMockSupabase() as any;
}

function makeSignal(overrides: Partial<FeedbackSignal> = {}): FeedbackSignal {
  return {
    kind: "reliability_alert",
    priority: "high",
    target_id: "agent-1",
    target_type: "agent",
    title: "Test signal",
    description: "Test desc",
    suggestion: "Test suggestion",
    data: {},
    ...overrides,
  };
}

describe("persistSignals", () => {
  it("creates signals in DB", async () => {
    const sb = makeSb();
    const signals = [makeSignal(), makeSignal({ kind: "cost_optimization" })];
    const result = await persistSignals(sb, signals);
    expect(result.created).toBe(2);
    expect(result.skipped_duplicates).toBe(0);
  });

  it("deduplicates open signals with same kind+target", async () => {
    const sb = makeSb();
    const signal = makeSignal();

    // First persist
    await persistSignals(sb, [signal]);
    // Second persist — should skip
    const result = await persistSignals(sb, [signal]);
    expect(result.skipped_duplicates).toBe(1);
    expect(result.created).toBe(0);
  });
});

describe("listSignals", () => {
  it("returns persisted signals", async () => {
    const sb = makeSb();
    await persistSignals(sb, [makeSignal()]);
    const { data } = await listSignals(sb);
    expect(data.length).toBe(1);
  });
});

describe("resolveSignal / acknowledgeSignal", () => {
  it("resolveSignal updates status", async () => {
    const sb = makeSb();
    await persistSignals(sb, [makeSignal()]);
    const { data: signals } = await listSignals(sb);
    const signalId = signals[0]?.id;
    expect(signalId).toBeTruthy();

    const { error } = await resolveSignal(sb, signalId, {
      status: "applied",
      applied_by: "operator",
      resolution_note: "fixed it",
    });
    expect(error).toBeFalsy();
  });

  it("acknowledgeSignal updates status", async () => {
    const sb = makeSb();
    await persistSignals(sb, [makeSignal()]);
    const { data: signals } = await listSignals(sb);
    const { error } = await acknowledgeSignal(sb, signals[0].id);
    expect(error).toBeFalsy();
  });
});
