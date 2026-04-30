/**
 * Briefing injection — vérifie que le briefing memory est passé à
 * `buildAgentSystemPrompt` par `runAiPipeline` et qu'il atterrit dans la
 * zone stable du system prompt (cacheable Anthropic ephemeral).
 *
 * Couvre aussi le fail-soft : si `generateBriefing` throw ou retourne
 * null, le pipeline construit le prompt sans briefing et n'échoue pas.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const {
  getToolsForUser,
  toAiTools,
  buildAgentSystemPromptMock,
  streamText,
  createAnthropic,
  generateBriefing,
} = vi.hoisted(() => ({
  getToolsForUser: vi.fn(),
  toAiTools: vi.fn(),
  buildAgentSystemPromptMock: vi.fn(),
  streamText: vi.fn(),
  createAnthropic: vi.fn(),
  generateBriefing: vi.fn(),
}));

vi.mock("@/lib/connectors/composio/discovery", () => ({
  getToolsForUser,
}));

vi.mock("@/lib/connectors/composio/to-ai-tools", () => ({
  toAiTools,
}));

vi.mock("@/lib/engine/orchestrator/system-prompt", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    buildAgentSystemPrompt: buildAgentSystemPromptMock,
  };
});

vi.mock("@/lib/memory/briefing", () => ({
  generateBriefing,
}));

vi.mock("@ai-sdk/anthropic", () => ({
  createAnthropic: createAnthropic.mockReturnValue(() => ({ modelId: "stub" })),
}));

vi.mock("ai", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    streamText,
  };
});

import { runAiPipeline } from "@/lib/engine/orchestrator/ai-pipeline";
import type { RunEngine } from "@/lib/engine/runtime/engine";
import type { RunEventBus } from "@/lib/events/bus";

function makeEngine(): RunEngine {
  return {
    id: "run-test",
    cost: { track: vi.fn().mockResolvedValue(undefined) },
    complete: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
  } as unknown as RunEngine;
}

function makeBus(): RunEventBus {
  return { emit: vi.fn() } as unknown as RunEventBus;
}

function makeStreamResult() {
  return {
    fullStream: (async function* () {})(),
    usage: Promise.resolve({ inputTokens: 0, outputTokens: 0 }),
  };
}

describe("runAiPipeline — briefing injection", () => {
  beforeEach(() => {
    getToolsForUser.mockReset();
    toAiTools.mockReset();
    buildAgentSystemPromptMock.mockReset();
    streamText.mockReset();
    generateBriefing.mockReset();

    getToolsForUser.mockResolvedValue([]);
    toAiTools.mockReturnValue({});
    buildAgentSystemPromptMock.mockReturnValue("system prompt");
    streamText.mockReturnValue(makeStreamResult());
  });

  it("briefing présent → injecté dans buildAgentSystemPrompt", async () => {
    generateBriefing.mockResolvedValue({
      text: "Tu as 3 emails non lus de Bob.",
      audioScript: "Tu as 3 emails non lus de Bob.",
    });

    await runAiPipeline(makeEngine(), makeBus(), {
      userId: "u1",
      message: "salut",
    });

    expect(buildAgentSystemPromptMock).toHaveBeenCalledTimes(1);
    const args = buildAgentSystemPromptMock.mock.calls[0][0] as {
      briefing?: string;
    };
    expect(args.briefing).toBe("Tu as 3 emails non lus de Bob.");
  });

  it("briefing null → buildAgentSystemPrompt reçoit briefing undefined", async () => {
    generateBriefing.mockResolvedValue(null);

    await runAiPipeline(makeEngine(), makeBus(), {
      userId: "u1",
      message: "salut",
    });

    const args = buildAgentSystemPromptMock.mock.calls[0][0] as {
      briefing?: string;
    };
    expect(args.briefing).toBeUndefined();
  });

  it("generateBriefing throw → fail-soft, pipeline ne crashe pas", async () => {
    generateBriefing.mockRejectedValue(new Error("redis down"));

    const engine = makeEngine();
    await runAiPipeline(engine, makeBus(), {
      userId: "u1",
      message: "salut",
    });

    expect(buildAgentSystemPromptMock).toHaveBeenCalledTimes(1);
    const args = buildAgentSystemPromptMock.mock.calls[0][0] as {
      briefing?: string;
    };
    expect(args.briefing).toBeUndefined();
    expect(engine.complete).toHaveBeenCalled();
  });
});

describe("buildAgentSystemPrompt — briefing rendering", () => {
  it("briefing fourni → balise <user_briefing> dans le prompt", async () => {
    const actual = await vi.importActual<
      typeof import("@/lib/engine/orchestrator/system-prompt")
    >("@/lib/engine/orchestrator/system-prompt");
    const prompt = actual.buildAgentSystemPrompt({
      composioTools: [],
      briefing: "Activité récente : 2 réunions cette semaine.",
    });
    expect(prompt).toContain("<user_briefing>");
    expect(prompt).toContain("Activité récente : 2 réunions cette semaine.");
    expect(prompt).toContain("</user_briefing>");
  });

  it("briefing vide → pas de balise", async () => {
    const actual = await vi.importActual<
      typeof import("@/lib/engine/orchestrator/system-prompt")
    >("@/lib/engine/orchestrator/system-prompt");
    const prompt = actual.buildAgentSystemPrompt({
      composioTools: [],
      briefing: "   ",
    });
    expect(prompt).not.toContain("<user_briefing>");
  });

  it("briefing absent → pas de balise", async () => {
    const actual = await vi.importActual<
      typeof import("@/lib/engine/orchestrator/system-prompt")
    >("@/lib/engine/orchestrator/system-prompt");
    const prompt = actual.buildAgentSystemPrompt({ composioTools: [] });
    expect(prompt).not.toContain("<user_briefing>");
  });

  it("briefing > 2000 chars → tronqué", async () => {
    const actual = await vi.importActual<
      typeof import("@/lib/engine/orchestrator/system-prompt")
    >("@/lib/engine/orchestrator/system-prompt");
    const long = "x".repeat(3000);
    const prompt = actual.buildAgentSystemPrompt({
      composioTools: [],
      briefing: long,
    });
    const match = prompt.match(/<user_briefing>\n([\s\S]+?)\n<\/user_briefing>/);
    expect(match).not.toBeNull();
    expect(match![1].length).toBeLessThanOrEqual(2000);
  });
});
