import { describe, it, expect } from "vitest";
import { trackChange, listChanges } from "../../lib/decisions/change-tracker";
import { createMockSupabase } from "../runtime/mock-supabase";

describe("change-tracker", () => {
  it("inserts a change record", async () => {
    const sb = createMockSupabase();
    const result = await trackChange(sb, {
      change_type: "guard_policy",
      target_id: "agent-1",
      target_type: "agent",
      before_value: { max_output_chars: 5000 },
      after_value: { max_output_chars: 8000 },
      actor: "operator",
      reason: "Increased output limit",
    });
    expect(result.id).toBeTruthy();
    expect(result.error).toBeUndefined();
  });

  it("links signal_id when provided", async () => {
    const sb = createMockSupabase();
    const result = await trackChange(sb, {
      signal_id: "sig-123",
      change_type: "cost_budget",
      target_id: "agent-2",
      target_type: "agent",
      before_value: { cost_budget: 0.5 },
      after_value: { cost_budget: 1.0 },
      actor: "admin",
    });
    expect(result.id).toBeTruthy();
  });

  it("lists changes ordered by created_at desc", async () => {
    const sb = createMockSupabase();
    await trackChange(sb, {
      change_type: "guard_policy",
      target_id: "agent-1",
      target_type: "agent",
      before_value: {},
      after_value: { blacklist: ["password"] },
      actor: "system",
    });
    await trackChange(sb, {
      change_type: "model_switch",
      target_id: "agent-1",
      target_type: "agent",
      before_value: { model: "gpt-4" },
      after_value: { model: "gpt-4o" },
      actor: "operator",
    });

    const { data } = await listChanges(sb, { target_id: "agent-1" });
    expect(data.length).toBeGreaterThanOrEqual(2);
  });

  it("filters by change_type", async () => {
    const sb = createMockSupabase();
    await trackChange(sb, {
      change_type: "guard_policy",
      target_id: "agent-1",
      target_type: "agent",
      before_value: {},
      after_value: {},
      actor: "system",
    });

    const { data } = await listChanges(sb, { change_type: "guard_policy" });
    expect(data.length).toBeGreaterThanOrEqual(1);
  });
});
