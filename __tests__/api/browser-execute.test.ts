/**
 * POST /api/v2/browser/[id]/execute — auth + scope + validation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

let authResult: {
  scope: { userId: string; tenantId: string; workspaceId: string; isDevFallback: boolean } | null;
  error: { message: string; status: number } | null;
} = {
  scope: {
    userId: "u1",
    tenantId: "t1",
    workspaceId: "w1",
    isDevFallback: false,
  },
  error: null,
};

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => authResult),
}));

vi.mock("@/lib/browser/stagehand-executor", () => ({
  runBrowserTask: vi.fn(async () => ({
    sessionId: "sess",
    summary: "ok",
    totalActions: 1,
    totalDurationMs: 10,
    aborted: false,
  })),
  clearUserControlled: vi.fn(),
}));

vi.mock("@/lib/browser/screenshot", () => ({
  persistExtraction: vi.fn(async () => ({ id: "asset-extract" })),
  persistSessionReport: vi.fn(async () => ({ id: "asset-report" })),
}));

const ORIGINAL_ENV = { ...process.env };

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/v2/browser/sess/execute", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/browser/[id]/execute", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, BROWSERBASE_API_KEY: "test-key" };
    authResult = {
      scope: {
        userId: "u1",
        tenantId: "t1",
        workspaceId: "w1",
        isDevFallback: false,
      },
      error: null,
    };
  });

  it("401 quand auth échoue", async () => {
    authResult = { scope: null, error: { message: "not_authenticated", status: 401 } };
    const { POST } = await import("@/app/api/v2/browser/[id]/execute/route");
    const res = await POST(
      makeReq({ task: "x" }) as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(401);
  });

  it("400 quand task manquant", async () => {
    const { POST } = await import("@/app/api/v2/browser/[id]/execute/route");
    const res = await POST(
      makeReq({}) as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("task_required");
  });

  it("503 quand BROWSERBASE_API_KEY manque", async () => {
    delete process.env.BROWSERBASE_API_KEY;
    const { POST } = await import("@/app/api/v2/browser/[id]/execute/route");
    const res = await POST(
      makeReq({ task: "x" }) as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(503);
  });

  it("200 avec taskId quand tout est ok", async () => {
    const { POST } = await import("@/app/api/v2/browser/[id]/execute/route");
    const res = await POST(
      makeReq({ task: "navigate to example.com" }) as never,
      { params: Promise.resolve({ id: "sess-123" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.taskId).toBeDefined();
    expect(body.sessionId).toBe("sess-123");
    expect(body.status).toBe("running");
  });
});
