import { describe, it, expect } from "vitest";
import type { FeedbackSignal, FeedbackKind, FeedbackPriority } from "@/lib/analytics/feedback";

describe("FeedbackSignal type", () => {
  it("satisfies the expected shape", () => {
    const signal: FeedbackSignal = {
      kind: "reliability_alert" as FeedbackKind,
      priority: "high" as FeedbackPriority,
      target_id: "agent-1",
      target_type: "agent",
      title: "Test signal",
      description: "Test description",
      suggestion: "Fix it",
      data: { key: "value" },
    };
    expect(signal.kind).toBe("reliability_alert");
    expect(signal.priority).toBe("high");
    expect(signal.target_type).toBe("agent");
  });
});
