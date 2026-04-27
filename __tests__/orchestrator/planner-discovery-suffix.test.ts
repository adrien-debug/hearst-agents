import { describe, it, expect, vi, beforeEach } from "vitest";

const { messagesCreate, createPlanSpy } = vi.hoisted(() => ({
  messagesCreate: vi.fn(),
  createPlanSpy: vi.fn(),
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: messagesCreate };
  },
}));

vi.mock("@/lib/engine/runtime/plans/store", () => ({
  PlanStore: class {
    createPlan = createPlanSpy;
    constructor(_db: unknown) {}
  },
}));

import { planFromIntent } from "@/lib/engine/orchestrator/planner";

function fakeEngine() {
  return {
    id: "run-test",
    cost: { track: vi.fn().mockResolvedValue(undefined) },
    attachPlanId: vi.fn().mockResolvedValue(undefined),
  };
}

function okResponse(text = "ok") {
  return {
    content: [
      {
        type: "tool_use",
        id: "t1",
        name: "text_response",
        input: { text },
      },
    ],
    usage: { input_tokens: 1, output_tokens: 1 },
  };
}

describe("planFromIntent — system prompt blocks", () => {
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "sk-test";
    messagesCreate.mockReset();
  });

  it("always emits the inline-connect guidance block, even with no discoveredActions", async () => {
    messagesCreate.mockResolvedValueOnce(okResponse());
    await planFromIntent(
      {} as never,
      fakeEngine() as never,
      "hello",
      [],
      { surface: "home" },
    );
    const params = messagesCreate.mock.calls[0][0];
    expect(Array.isArray(params.system)).toBe(true);
    expect(params.system).toHaveLength(2);
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[1].cache_control).toBeUndefined();
    expect(params.system[1].text).toMatch(/INLINE CONNECT/);
  });

  it("appends a SECOND uncached block listing per-user actions when provided", async () => {
    messagesCreate.mockResolvedValueOnce(okResponse());
    await planFromIntent({} as never, fakeEngine() as never, "hi", [], {
      discoveredActions: ["GMAIL_SEND_EMAIL", "SLACKBOT_SEND_MESSAGE"],
    });
    const params = messagesCreate.mock.calls[0][0];
    expect(params.system).toHaveLength(2);
    // Static block keeps its cache_control; the dynamic suffix MUST NOT cache.
    expect(params.system[0].cache_control).toEqual({ type: "ephemeral" });
    expect(params.system[1].cache_control).toBeUndefined();
    expect(params.system[1].text).toContain("GMAIL_SEND_EMAIL");
    expect(params.system[1].text).toContain("SLACKBOT_SEND_MESSAGE");
  });

  it("includes the draft-first write rule when discoveredActions contains a write op", async () => {
    messagesCreate.mockResolvedValueOnce(okResponse());
    await planFromIntent({} as never, fakeEngine() as never, "hi", [], {
      discoveredActions: ["GMAIL_SEND_EMAIL"],
    });
    const text = messagesCreate.mock.calls[0][0].system[1].text as string;
    expect(text).toMatch(/WRITE ACTIONS DETECTED/);
    expect(text).toMatch(/Confirmer l'envoi/);
    expect(text).toMatch(/non-negotiable/);
  });

  it("omits the write rule when only read ops are connected", async () => {
    messagesCreate.mockResolvedValueOnce(okResponse());
    await planFromIntent({} as never, fakeEngine() as never, "hi", [], {
      discoveredActions: ["GMAIL_FETCH_EMAILS", "GMAIL_LIST_THREADS"],
    });
    const text = messagesCreate.mock.calls[0][0].system[1].text as string;
    expect(text).not.toMatch(/WRITE ACTIONS DETECTED/);
  });

  it("truncates the action list at 80 names and reports the overflow count", async () => {
    const lots = Array.from({ length: 120 }, (_, i) => `APP_ACTION_${i}`);
    messagesCreate.mockResolvedValueOnce(okResponse());
    await planFromIntent({} as never, fakeEngine() as never, "hi", [], {
      discoveredActions: lots,
    });
    const text = messagesCreate.mock.calls[0][0].system[1].text as string;
    expect(text).toContain("APP_ACTION_0");
    expect(text).toContain("APP_ACTION_79");
    expect(text).not.toContain("APP_ACTION_80");
    expect(text).toContain("+40 more");
  });

  it("still accepts the legacy positional (surface, capabilityDomain) signature", async () => {
    messagesCreate.mockResolvedValueOnce(okResponse());
    await planFromIntent(
      {} as never,
      fakeEngine() as never,
      "hi",
      [],
      "inbox",
      "communication",
    );
    const params = messagesCreate.mock.calls[0][0];
    // 2 blocks now: cached static + dynamic (inline-connect guidance always present)
    expect(params.system).toHaveLength(2);
  });

  it("handles request_connection tool_use in the LLM response", async () => {
    messagesCreate.mockResolvedValueOnce({
      content: [
        {
          type: "tool_use",
          id: "tc1",
          name: "request_connection",
          input: { app: "Slack", reason: "Pour envoyer ce message." },
        },
      ],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const { planFromIntent: pf } = await import("@/lib/engine/orchestrator/planner");
    const r = await pf({} as never, fakeEngine() as never, "envoie un slack", [], {
      discoveredActions: [],
    });
    expect(r.kind).toBe("request_connection");
    if (r.kind === "request_connection") {
      expect(r.app).toBe("slack");
      expect(r.reason).toBe("Pour envoyer ce message.");
    }
  });
});
