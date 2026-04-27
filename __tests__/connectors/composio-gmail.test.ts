import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const { executeAction } = vi.hoisted(() => ({ executeAction: vi.fn() }));

vi.mock("composio-core", () => {
  class OpenAIToolSet {
    constructor(_opts: { apiKey: string }) {}
    executeAction = executeAction;
  }
  return { OpenAIToolSet };
});

import { gmailSendEmail, resetComposioClient } from "@/lib/connectors/composio";

describe("gmailSendEmail", () => {
  beforeEach(() => {
    resetComposioClient();
    executeAction.mockReset();
    process.env.COMPOSIO_API_KEY = "ck_test";
  });
  afterEach(() => {
    delete process.env.COMPOSIO_API_KEY;
    resetComposioClient();
  });

  it("rejects empty required fields without calling Composio", async () => {
    const result = await gmailSendEmail({
      userId: "u1",
      to: "",
      subject: "hi",
      body: "ok",
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty/);
    expect(executeAction).not.toHaveBeenCalled();
  });

  it("forwards typed params using Composio's snake_case schema", async () => {
    executeAction.mockResolvedValueOnce({ id: "msg-1" });
    await gmailSendEmail({
      userId: "u1",
      to: "to@x.com",
      subject: "hi",
      body: "<p>hi</p>",
      cc: ["cc@x.com"],
      isHtml: true,
    });

    const call = executeAction.mock.calls[0][0];
    expect(call.action).toBe("GMAIL_SEND_EMAIL");
    expect(call.entityId).toBe("u1");
    expect(call.params).toMatchObject({
      recipient_email: "to@x.com",
      subject: "hi",
      body: "<p>hi</p>",
      cc: ["cc@x.com"],
      is_html: true,
    });
    expect(call.params).not.toHaveProperty("bcc");
  });

  it("extracts the Gmail messageId from the wrapped response", async () => {
    executeAction.mockResolvedValueOnce({ data: { id: "gmail-msg-42" } });
    const r = await gmailSendEmail({ userId: "u1", to: "a@b.c", subject: "s", body: "b" });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("gmail-msg-42");
  });

  it("returns AUTH_REQUIRED when the user hasn't connected Gmail in Composio", async () => {
    executeAction.mockRejectedValueOnce(new Error("No connected account found"));
    const r = await gmailSendEmail({ userId: "u1", to: "a@b.c", subject: "s", body: "b" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("AUTH_REQUIRED");
  });
});
