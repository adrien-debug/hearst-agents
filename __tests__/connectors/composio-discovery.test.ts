import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { getTools, executeAction } = vi.hoisted(() => ({
  getTools: vi.fn(),
  executeAction: vi.fn(),
}));

vi.mock("composio-core", () => {
  class OpenAIToolSet {
    constructor(_opts: { apiKey: string }) {}
    executeAction = executeAction;
    getTools = getTools;
    client = {
      connectedAccounts: {
        list: vi.fn(),
        initiate: vi.fn(),
        delete: vi.fn(),
      },
      apps: { list: vi.fn() },
    };
  }
  return { OpenAIToolSet };
});

import {
  getToolsForUser,
  resetDiscoveryCache,
  invalidateUserDiscovery,
  toAnthropicTools,
  toOpenAITools,
  resetComposioClient,
} from "@/lib/connectors/composio";

const sampleTool = {
  type: "function",
  function: {
    name: "GMAIL_SEND_EMAIL",
    description: "Send an email",
    parameters: { type: "object", properties: { to: { type: "string" } } },
  },
};

const sampleSlack = {
  type: "function",
  function: {
    name: "SLACKBOT_SEND_MESSAGE",
    description: "Send a Slack message",
    parameters: { type: "object", properties: {} },
  },
};

describe("Composio discovery", () => {
  beforeEach(() => {
    resetDiscoveryCache();
    resetComposioClient();
    getTools.mockReset();
    process.env.COMPOSIO_API_KEY = "ck_test";
  });
  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
    resetDiscoveryCache();
    resetComposioClient();
  });

  it("returns [] without hitting the SDK when userId is empty", async () => {
    const out = await getToolsForUser("");
    expect(out).toEqual([]);
    expect(getTools).not.toHaveBeenCalled();
  });

  it("forwards entityId = userId so multi-tenant isolation is preserved", async () => {
    getTools.mockResolvedValueOnce([sampleTool]);
    await getToolsForUser("user-marie");

    expect(getTools).toHaveBeenCalledWith(
      expect.objectContaining({ filterByAvailableApps: true }),
      "user-marie",
    );
  });

  it("normalizes raw OpenAI tools into DiscoveredTool with derived app slug", async () => {
    getTools.mockResolvedValueOnce([sampleTool, sampleSlack]);
    const out = await getToolsForUser("u1");
    expect(out).toEqual([
      expect.objectContaining({ name: "GMAIL_SEND_EMAIL", app: "gmail" }),
      expect.objectContaining({ name: "SLACKBOT_SEND_MESSAGE", app: "slackbot" }),
    ]);
  });

  it("caches per-user — second call within TTL doesn't hit the SDK", async () => {
    getTools.mockResolvedValueOnce([sampleTool]);
    await getToolsForUser("u1");
    await getToolsForUser("u1");
    expect(getTools).toHaveBeenCalledTimes(1);
  });

  it("invalidateUserDiscovery forces a refetch", async () => {
    getTools.mockResolvedValueOnce([sampleTool]);
    await getToolsForUser("u1");
    invalidateUserDiscovery("u1");
    getTools.mockResolvedValueOnce([sampleTool, sampleSlack]);
    const out = await getToolsForUser("u1");
    expect(out).toHaveLength(2);
    expect(getTools).toHaveBeenCalledTimes(2);
  });

  it("isolates cache between users (u1 cached doesn't serve u2)", async () => {
    getTools.mockResolvedValueOnce([sampleTool]);
    await getToolsForUser("u1");
    getTools.mockResolvedValueOnce([sampleSlack]);
    const out = await getToolsForUser("u2");
    expect(out[0].name).toBe("SLACKBOT_SEND_MESSAGE");
    expect(getTools).toHaveBeenCalledTimes(2);
  });

  it("returns [] without throwing when SDK throws", async () => {
    getTools.mockRejectedValueOnce(new Error("Composio rate-limit"));
    const out = await getToolsForUser("u1");
    expect(out).toEqual([]);
  });

  it("converts to Anthropic tool format", () => {
    const out = toAnthropicTools([
      { name: "X", description: "desc", parameters: { type: "object" }, app: "x" },
    ]);
    expect(out[0]).toMatchObject({
      name: "X",
      description: "desc",
      input_schema: { type: "object" },
    });
  });

  it("converts to OpenAI function-calling format", () => {
    const out = toOpenAITools([
      { name: "X", description: "desc", parameters: { type: "object" }, app: "x" },
    ]);
    expect(out[0]).toMatchObject({
      type: "function",
      function: { name: "X", parameters: { type: "object" } },
    });
  });
});
