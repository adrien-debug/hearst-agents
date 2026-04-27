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

import { executeTool } from "@/lib/agents/backend-v2/openai-tools";
import { resetComposioClient } from "@/lib/connectors/composio";

describe("openai-tools registry — gmail_send_email (new SDK)", () => {
  beforeEach(() => {
    resetComposioClient();
    execute.mockReset();
    process.env.COMPOSIO_API_KEY = "ak_test";
  });
  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
    resetComposioClient();
  });

  it("refuses to send when no user context is provided (LLM cannot spoof from-identity)", async () => {
    const out = await executeTool("gmail_send_email", {
      to: "a@b.c",
      subject: "s",
      body: "b",
    });
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(parsed.error).toMatch(/authenticated user/);
    expect(execute).not.toHaveBeenCalled();
  });

  it("uses context.userId as the SDK userId", async () => {
    execute.mockResolvedValueOnce({ id: "msg-9" });

    const out = await executeTool(
      "gmail_send_email",
      { to: "to@x.com", subject: "hi", body: "ok" },
      { userId: "user-99" },
    );

    const call = execute.mock.calls[0];
    expect(call[0]).toBe("GMAIL_SEND_EMAIL");
    expect(call[1].userId).toBe("user-99");

    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.messageId).toBe("msg-9");
  });

  it("returns the raw error envelope when Composio fails", async () => {
    execute.mockRejectedValueOnce(new Error("No connected account"));
    const out = await executeTool(
      "gmail_send_email",
      { to: "to@x.com", subject: "hi", body: "ok" },
      { userId: "user-99" },
    );
    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(false);
    expect(parsed.errorCode).toBe("AUTH_REQUIRED");
  });
});
