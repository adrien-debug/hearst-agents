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

import { gmailSendEmail, resetComposioClient } from "@/lib/connectors/composio";

describe("gmailSendEmail (new SDK)", () => {
  beforeEach(() => {
    resetComposioClient();
    execute.mockReset();
    process.env.COMPOSIO_API_KEY = "ak_test";
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
    expect(execute).not.toHaveBeenCalled();
  });

  it("forwards typed params using Composio's snake_case schema", async () => {
    execute.mockResolvedValueOnce({ id: "msg-1" });
    await gmailSendEmail({
      userId: "u1",
      to: "to@x.com",
      subject: "hi",
      body: "<p>hi</p>",
      cc: ["cc@x.com"],
      isHtml: true,
    });

    const call = execute.mock.calls[0];
    expect(call[0]).toBe("GMAIL_SEND_EMAIL");
    expect(call[1].userId).toBe("u1");
    expect(call[1].arguments).toMatchObject({
      recipient_email: "to@x.com",
      subject: "hi",
      body: "<p>hi</p>",
      cc: ["cc@x.com"],
      is_html: true,
    });
    expect(call[1].arguments).not.toHaveProperty("bcc");
  });

  it("extracts the Gmail messageId from the wrapped response", async () => {
    execute.mockResolvedValueOnce({ data: { id: "gmail-msg-42" } });
    const r = await gmailSendEmail({ userId: "u1", to: "a@b.c", subject: "s", body: "b" });
    expect(r.ok).toBe(true);
    expect(r.messageId).toBe("gmail-msg-42");
  });

  it("returns AUTH_REQUIRED when the user hasn't connected Gmail", async () => {
    execute.mockRejectedValueOnce(new Error("No connected account found"));
    const r = await gmailSendEmail({ userId: "u1", to: "a@b.c", subject: "s", body: "b" });
    expect(r.ok).toBe(false);
    expect(r.errorCode).toBe("AUTH_REQUIRED");
  });
});
