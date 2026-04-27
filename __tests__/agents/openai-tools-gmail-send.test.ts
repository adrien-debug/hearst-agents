import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { executeAction } = vi.hoisted(() => ({ executeAction: vi.fn() }));

vi.mock("composio-core", () => {
  class OpenAIToolSet {
    constructor(_opts: { apiKey: string }) {}
    executeAction = executeAction;
  }
  return { OpenAIToolSet };
});

import { executeTool } from "@/lib/agents/backend-v2/openai-tools";
import { resetComposioClient } from "@/lib/connectors/composio";

describe("openai-tools registry — gmail_send_email", () => {
  beforeEach(() => {
    resetComposioClient();
    executeAction.mockReset();
    process.env.COMPOSIO_API_KEY = "ck_test";
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
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("uses context.userId as the Composio entityId", async () => {
    executeAction.mockResolvedValueOnce({ id: "msg-9" });

    const out = await executeTool(
      "gmail_send_email",
      { to: "to@x.com", subject: "hi", body: "ok" },
      { userId: "user-99" },
    );

    const call = executeAction.mock.calls[0][0];
    expect(call.entityId).toBe("user-99");

    const parsed = JSON.parse(out);
    expect(parsed.ok).toBe(true);
    expect(parsed.messageId).toBe("msg-9");
  });

  it("returns the raw error envelope when Composio fails", async () => {
    executeAction.mockRejectedValueOnce(new Error("No connected account"));
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
