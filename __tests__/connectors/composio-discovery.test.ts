import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { toolsList, toolsExecute, connectedAccountsList } = vi.hoisted(() => ({
  toolsList: vi.fn(),
  toolsExecute: vi.fn(),
  connectedAccountsList: vi.fn(),
}));

vi.mock("@composio/core", () => {
  class Composio {
    tools = { list: toolsList, execute: toolsExecute };
    toolkits = { list: vi.fn(), get: vi.fn(), authorize: vi.fn() };
    connectedAccounts = { list: connectedAccountsList, delete: vi.fn() };
    create = vi.fn();
    constructor(_opts: { apiKey?: string }) {}
  }
  return { Composio };
});

// Helper: pre-stub connectedAccounts.list to return ACTIVE accounts for the
// toolkits we expect tools.list to be queried for. Without this, the new
// cross-check short-circuits at "no ACTIVE toolkits" and returns [].
function stubActiveAccounts(slugs: string[]): void {
  connectedAccountsList.mockResolvedValue({
    items: slugs.map((slug, i) => ({
      id: `acc-${i}`,
      toolkit: { slug },
      status: "ACTIVE",
    })),
  });
}

import {
  getToolsForUser,
  resetDiscoveryCache,
  invalidateUserDiscovery,
  toAnthropicTools,
  toOpenAITools,
  resetComposioClient,
} from "@/lib/connectors/composio";

const sampleGmail = {
  slug: "GMAIL_SEND_EMAIL",
  description: "Send an email",
  inputParameters: { type: "object", properties: { to: { type: "string" } } },
  toolkit: { slug: "gmail" },
};

const sampleSlack = {
  slug: "SLACKBOT_SEND_MESSAGE",
  description: "Send a Slack message",
  inputParameters: { type: "object", properties: {} },
  toolkit: { slug: "slackbot" },
};

describe("Composio discovery (new SDK)", () => {
  beforeEach(() => {
    resetDiscoveryCache();
    resetComposioClient();
    toolsList.mockReset();
    connectedAccountsList.mockReset();
    process.env.COMPOSIO_API_KEY = "ak_test";
  });
  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
    resetDiscoveryCache();
    resetComposioClient();
  });

  it("returns [] without hitting the SDK when userId is empty", async () => {
    const out = await getToolsForUser("");
    expect(out).toEqual([]);
    expect(toolsList).not.toHaveBeenCalled();
  });

  it("forwards { userId } to the SDK so multi-tenant isolation is preserved", async () => {
    stubActiveAccounts(["gmail"]);
    toolsList.mockResolvedValueOnce({ items: [sampleGmail] });
    await getToolsForUser("user-marie");

    expect(toolsList).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-marie" }));
  });

  it("normalizes raw tools into DiscoveredTool with derived app slug", async () => {
    stubActiveAccounts(["gmail", "slackbot"]);
    toolsList.mockResolvedValueOnce({ items: [sampleGmail, sampleSlack] });
    const out = await getToolsForUser("u1");
    expect(out).toEqual([
      expect.objectContaining({ name: "GMAIL_SEND_EMAIL", app: "gmail" }),
      expect.objectContaining({ name: "SLACKBOT_SEND_MESSAGE", app: "slackbot" }),
    ]);
  });

  it("caches per-user — second call within TTL doesn't hit the SDK", async () => {
    stubActiveAccounts(["gmail"]);
    toolsList.mockResolvedValueOnce({ items: [sampleGmail] });
    await getToolsForUser("u1");
    await getToolsForUser("u1");
    expect(toolsList).toHaveBeenCalledTimes(1);
  });

  it("invalidateUserDiscovery forces a refetch", async () => {
    stubActiveAccounts(["gmail"]);
    toolsList.mockResolvedValueOnce({ items: [sampleGmail] });
    await getToolsForUser("u1");
    invalidateUserDiscovery("u1");
    stubActiveAccounts(["gmail", "slackbot"]);
    toolsList.mockResolvedValueOnce({ items: [sampleGmail, sampleSlack] });
    const out = await getToolsForUser("u1");
    expect(out).toHaveLength(2);
    expect(toolsList).toHaveBeenCalledTimes(2);
  });

  it("isolates cache between users", async () => {
    stubActiveAccounts(["gmail"]);
    toolsList.mockResolvedValueOnce({ items: [sampleGmail] });
    await getToolsForUser("u1");
    stubActiveAccounts(["slackbot"]);
    toolsList.mockResolvedValueOnce({ items: [sampleSlack] });
    const out = await getToolsForUser("u2");
    expect(out[0].name).toBe("SLACKBOT_SEND_MESSAGE");
    expect(toolsList).toHaveBeenCalledTimes(2);
  });

  it("returns [] without throwing when SDK throws", async () => {
    stubActiveAccounts(["gmail"]);
    toolsList.mockRejectedValueOnce(new Error("Composio rate-limit"));
    const out = await getToolsForUser("u1");
    expect(out).toEqual([]);
  });

  it("returns [] without hitting tools.list when the user has no ACTIVE accounts", async () => {
    connectedAccountsList.mockResolvedValueOnce({ items: [] });
    const out = await getToolsForUser("u1");
    expect(out).toEqual([]);
    expect(toolsList).not.toHaveBeenCalled();
  });

  it("does NOT cache empty results — re-queries on the next call", async () => {
    // First call: no ACTIVE accounts (mid-OAuth, propagation lag).
    connectedAccountsList.mockResolvedValueOnce({ items: [] });
    const first = await getToolsForUser("u1");
    expect(first).toEqual([]);
    // Second call: connection finally registered.
    stubActiveAccounts(["slackbot"]);
    toolsList.mockResolvedValueOnce({ items: [sampleSlack] });
    const second = await getToolsForUser("u1");
    expect(second).toHaveLength(1);
    // Both calls must hit the SDK — empty was not cached.
    expect(connectedAccountsList).toHaveBeenCalledTimes(2);
  });

  it("intersects opts.apps with ACTIVE accounts", async () => {
    stubActiveAccounts(["gmail", "slackbot"]);
    toolsList.mockResolvedValueOnce({ items: [sampleSlack] });
    await getToolsForUser("u1", { apps: ["slackbot", "github"] });
    // tools.list should be called with only the intersection: slackbot.
    expect(toolsList).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "u1", toolkits: ["slackbot"] }),
    );
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
