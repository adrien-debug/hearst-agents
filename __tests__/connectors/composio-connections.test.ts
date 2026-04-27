import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { toolkitsAuthorize, accountsList, accountsDelete } = vi.hoisted(() => ({
  toolkitsAuthorize: vi.fn(),
  accountsList: vi.fn(),
  accountsDelete: vi.fn(),
}));

vi.mock("@composio/core", () => {
  class Composio {
    tools = { execute: vi.fn(), list: vi.fn() };
    toolkits = { list: vi.fn(), get: vi.fn(), authorize: toolkitsAuthorize };
    connectedAccounts = { list: accountsList, delete: accountsDelete };
    create = vi.fn();
    constructor(_opts: { apiKey?: string }) {}
  }
  return { Composio };
});

import {
  initiateConnection,
  listConnections,
  disconnectAccount,
  resetComposioClient,
  resetDiscoveryCache,
} from "@/lib/connectors/composio";

describe("Composio connections (new SDK)", () => {
  beforeEach(() => {
    resetComposioClient();
    resetDiscoveryCache();
    toolkitsAuthorize.mockReset();
    accountsList.mockReset();
    accountsDelete.mockReset();
    process.env.COMPOSIO_API_KEY = "ak_test";
  });
  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
    resetComposioClient();
    resetDiscoveryCache();
  });

  describe("initiateConnection", () => {
    it("returns NOT_CONFIGURED when api key is missing — never throws", async () => {
      delete process.env.COMPOSIO_API_KEY;
      const r = await initiateConnection("u1", "slack");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/COMPOSIO_API_KEY/);
    });

    it("requires both userId and appName", async () => {
      const a = await initiateConnection("", "slack");
      const b = await initiateConnection("u1", "");
      expect(a.ok).toBe(false);
      expect(b.ok).toBe(false);
    });

    it("calls toolkits.authorize(userId, lowercased slug) and returns redirectUrl", async () => {
      toolkitsAuthorize.mockResolvedValueOnce({ id: "c1", redirectUrl: "https://x" });
      const r = await initiateConnection("user-42", "Slack");
      expect(toolkitsAuthorize).toHaveBeenCalledWith("user-42", "slack");
      expect(r).toEqual({ ok: true, redirectUrl: "https://x", connectionId: "c1" });
    });

    it("maps 'no auth config' upstream errors to NO_INTEGRATION", async () => {
      toolkitsAuthorize.mockRejectedValueOnce(new Error("No auth config found for toolkit slack"));
      const r = await initiateConnection("u1", "slack");
      expect(r.ok).toBe(false);
      expect(r.errorCode).toBe("NO_INTEGRATION");
      expect(r.error).toMatch(/Aucune intégration slack/);
    });
  });

  describe("listConnections", () => {
    it("returns [] without hitting SDK when api key is missing", async () => {
      delete process.env.COMPOSIO_API_KEY;
      const r = await listConnections("u1");
      expect(r).toEqual([]);
      expect(accountsList).not.toHaveBeenCalled();
    });

    it("normalizes the new SDK shape (toolkit object, nanoid)", async () => {
      accountsList.mockResolvedValueOnce({
        items: [
          { id: "c1", toolkit: { slug: "Slack" }, status: "ACTIVE" },
          { nanoid: "c2", toolkit: "Gmail", status: "ACTIVE" },
          { /* missing id */ toolkit: { slug: "ghost" } },
        ],
      });
      const r = await listConnections("u1");
      expect(r).toEqual([
        expect.objectContaining({ id: "c1", appName: "slack" }),
        expect.objectContaining({ id: "c2", appName: "gmail" }),
      ]);
    });

    it("forwards userIds for server-side tenant filtering", async () => {
      accountsList.mockResolvedValueOnce({ items: [] });
      await listConnections("user-42");
      expect(accountsList).toHaveBeenCalledWith(
        expect.objectContaining({ userIds: ["user-42"] }),
      );
    });
  });

  describe("disconnectAccount", () => {
    it("calls SDK delete with the connection id", async () => {
      accountsDelete.mockResolvedValueOnce(undefined);
      const r = await disconnectAccount("u1", "c1");
      expect(accountsDelete).toHaveBeenCalledWith("c1");
      expect(r.ok).toBe(true);
    });

    it("returns ok=false when SDK throws", async () => {
      accountsDelete.mockRejectedValueOnce(new Error("oh no"));
      const r = await disconnectAccount("u1", "c1");
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/oh no/);
    });
  });
});
