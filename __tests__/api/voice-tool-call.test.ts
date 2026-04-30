/**
 * POST /api/v2/voice/tool-call — vérifie l'auth, le dispatch executeVoiceTool,
 * et la persistance fire-and-forget (tool_call pending + tool_result final).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { executeVoiceToolMock, appendTranscriptMock } = vi.hoisted(() => ({
  executeVoiceToolMock: vi.fn(),
  appendTranscriptMock: vi.fn().mockResolvedValue(true),
}));

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "user-test",
      tenantId: "tenant-test",
      workspaceId: "ws-test",
      isDevFallback: false,
    },
    error: null,
  })),
}));

vi.mock("@/lib/voice/tools", () => ({
  executeVoiceTool: executeVoiceToolMock,
}));

vi.mock("@/lib/voice/transcript-store", () => ({
  appendTranscriptEntry: appendTranscriptMock,
}));

beforeEach(() => {
  executeVoiceToolMock.mockReset();
  appendTranscriptMock.mockClear().mockResolvedValue(true);
});

interface ToolCallResponse {
  output?: string;
  status?: string;
  error?: string;
  providerId?: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(body: unknown): any {
  return new Request("http://localhost/api/v2/voice/tool-call", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/voice/tool-call", () => {
  it("400 si body sans `name`", async () => {
    const { POST } = await import("@/app/api/v2/voice/tool-call/route");
    const res = await POST(makeReq({ args: {} }));
    expect(res.status).toBe(400);
  });

  it("succès → renvoie l'output + persiste tool_call et tool_result", async () => {
    executeVoiceToolMock.mockResolvedValue({
      output: "ok",
      providerId: "gmail",
      status: "success",
      latencyMs: 42,
    });

    const { POST } = await import("@/app/api/v2/voice/tool-call/route");
    const res = await POST(
      makeReq({
        name: "GMAIL_SEND_EMAIL",
        args: { to: "test@example.com" },
        callId: "call-1",
        sessionId: "sess-1",
      }),
    );
    const body = (await res.json()) as ToolCallResponse;

    expect(res.status).toBe(200);
    expect(body.output).toBe("ok");
    expect(body.providerId).toBe("gmail");
    // 2 entries : tool_call (pending) + tool_result (success)
    expect(appendTranscriptMock).toHaveBeenCalledTimes(2);
    const firstCall = appendTranscriptMock.mock.calls[0][0];
    const secondCall = appendTranscriptMock.mock.calls[1][0];
    expect(firstCall.entry.role).toBe("tool_call");
    expect(firstCall.entry.status).toBe("pending");
    expect(secondCall.entry.role).toBe("tool_result");
    expect(secondCall.entry.status).toBe("success");
  });

  it("erreur tool → 500 + tool_result error persisté", async () => {
    executeVoiceToolMock.mockRejectedValue(new Error("Composio down"));

    const { POST } = await import("@/app/api/v2/voice/tool-call/route");
    const res = await POST(
      makeReq({
        name: "GMAIL_SEND_EMAIL",
        args: {},
        callId: "call-2",
        sessionId: "sess-2",
      }),
    );
    const body = (await res.json()) as ToolCallResponse;
    expect(res.status).toBe(500);
    expect(body.error).toBe("tool_failed");
    expect(body.output).toContain("Composio down");
    // tool_call pending + tool_result error
    expect(appendTranscriptMock).toHaveBeenCalledTimes(2);
    const lastCall = appendTranscriptMock.mock.calls[1][0];
    expect(lastCall.entry.status).toBe("error");
  });

  it("sans sessionId → ne persiste rien (compat path)", async () => {
    executeVoiceToolMock.mockResolvedValue({ output: "ok", status: "success" });
    const { POST } = await import("@/app/api/v2/voice/tool-call/route");
    await POST(makeReq({ name: "start_simulation", args: { scenario: "x" } }));
    expect(appendTranscriptMock).not.toHaveBeenCalled();
  });
});
