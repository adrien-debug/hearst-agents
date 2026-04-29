import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { execute } = vi.hoisted(() => ({ execute: vi.fn() }));

vi.mock("@composio/core", () => {
  class Composio {
    tools = { execute, list: vi.fn() };
    toolkits = { list: vi.fn(), get: vi.fn(), authorize: vi.fn() };
    connectedAccounts = { list: vi.fn(), delete: vi.fn() };
    create = vi.fn();
    constructor(_opts: { apiKey?: string }) {}
  }
  return { Composio };
});

import {
  executeComposioAction,
  isComposioConfigured,
  resetComposioClient,
} from "@/lib/connectors/composio";

describe("Composio client (v0.6 SDK)", () => {
  beforeEach(() => {
    resetComposioClient();
    execute.mockReset();
  });
  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
    resetComposioClient();
  });

  describe("isComposioConfigured", () => {
    it("returns false when COMPOSIO_API_KEY is unset", () => {
      delete process.env.COMPOSIO_API_KEY;
      expect(isComposioConfigured()).toBe(false);
    });
    it("returns true when COMPOSIO_API_KEY is set", () => {
      process.env.COMPOSIO_API_KEY = "ak_test";
      expect(isComposioConfigured()).toBe(true);
    });
  });

  describe("executeComposioAction", () => {
    it("returns NOT_CONFIGURED when API key is missing — never throws", async () => {
      delete process.env.COMPOSIO_API_KEY;
      const result = await executeComposioAction({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-1",
        params: {},
      });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("NOT_CONFIGURED");
      expect(execute).not.toHaveBeenCalled();
    });

    it("forwards (slug, { userId, arguments, dangerouslySkipVersionCheck }) to the SDK and wraps the result", async () => {
      process.env.COMPOSIO_API_KEY = "ak_test";
      execute.mockResolvedValueOnce({ id: "msg-123" });

      const result = await executeComposioAction({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-42",
        params: { recipient_email: "x@y.z", subject: "hi", body: "ok" },
      });

      // dangerouslySkipVersionCheck est ajouté par le wrapper pour préserver
      // le comportement legacy "latest" — Composio 0.6+ throw sinon.
      expect(execute).toHaveBeenCalledWith("GMAIL_SEND_EMAIL", {
        userId: "user-42",
        arguments: { recipient_email: "x@y.z", subject: "hi", body: "ok" },
        dangerouslySkipVersionCheck: true,
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ id: "msg-123" });
    });

    it("maps auth-shaped errors to AUTH_REQUIRED", async () => {
      process.env.COMPOSIO_API_KEY = "ak_test";
      execute.mockRejectedValueOnce(new Error("No connected account for user user-7"));

      const result = await executeComposioAction({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-7",
        params: {},
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("AUTH_REQUIRED");
    });

    it("falls back to ACTION_FAILED for generic errors", async () => {
      process.env.COMPOSIO_API_KEY = "ak_test";
      execute.mockRejectedValueOnce(new Error("Provider returned 502"));

      const result = await executeComposioAction({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-7",
        params: {},
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("ACTION_FAILED");
      expect(result.error).toContain("502");
    });
  });
});
