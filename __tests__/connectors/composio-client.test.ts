import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { executeAction } = vi.hoisted(() => ({ executeAction: vi.fn() }));

// `composio-core` is an optional peer dep; we mock it virtually so tests
// run regardless of whether the package is actually installed.
vi.mock("composio-core", () => {
  class OpenAIToolSet {
    constructor(_opts: { apiKey: string }) {}
    executeAction = executeAction;
  }
  return { OpenAIToolSet };
});

import {
  executeComposioAction,
  isComposioConfigured,
  resetComposioClient,
} from "@/lib/connectors/composio";

describe("Composio client", () => {
  beforeEach(() => {
    resetComposioClient();
    executeAction.mockReset();
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
      process.env.COMPOSIO_API_KEY = "ck_test";
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
      expect(executeAction).not.toHaveBeenCalled();
    });

    it("forwards (action, entityId, params) to the SDK and wraps the result", async () => {
      process.env.COMPOSIO_API_KEY = "ck_test";
      executeAction.mockResolvedValueOnce({ id: "msg-123" });

      const result = await executeComposioAction({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-42",
        params: { recipient_email: "x@y.z", subject: "hi", body: "ok" },
      });

      expect(executeAction).toHaveBeenCalledWith({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-42",
        params: { recipient_email: "x@y.z", subject: "hi", body: "ok" },
      });
      expect(result.ok).toBe(true);
      expect(result.data).toEqual({ id: "msg-123" });
    });

    it("maps auth-shaped errors to AUTH_REQUIRED", async () => {
      process.env.COMPOSIO_API_KEY = "ck_test";
      executeAction.mockRejectedValueOnce(new Error("No connected account for entityId user-7"));

      const result = await executeComposioAction({
        action: "GMAIL_SEND_EMAIL",
        entityId: "user-7",
        params: {},
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("AUTH_REQUIRED");
    });

    it("falls back to ACTION_FAILED for generic errors", async () => {
      process.env.COMPOSIO_API_KEY = "ck_test";
      executeAction.mockRejectedValueOnce(new Error("Provider returned 502"));

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
