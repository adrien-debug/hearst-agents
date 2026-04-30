/**
 * POST /api/v2/browser/[id]/capture — auth + capture flow.
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

const captureFn = vi.fn();

vi.mock("@/lib/browser/screenshot", () => ({
  captureScreenshot: (...args: unknown[]) => captureFn(...args),
}));

const ORIGINAL_ENV = { ...process.env };

function makeReq(): Request {
  return new Request("http://localhost/api/v2/browser/sess/capture", {
    method: "POST",
  });
}

describe("POST /api/v2/browser/[id]/capture", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV, BROWSERBASE_API_KEY: "k" };
    captureFn.mockReset();
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

  it("401 sans auth", async () => {
    authResult = { scope: null, error: { message: "not_authenticated", status: 401 } };
    const { POST } = await import("@/app/api/v2/browser/[id]/capture/route");
    const res = await POST(
      makeReq() as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(401);
  });

  it("503 sans BROWSERBASE_API_KEY", async () => {
    delete process.env.BROWSERBASE_API_KEY;
    const { POST } = await import("@/app/api/v2/browser/[id]/capture/route");
    const res = await POST(
      makeReq() as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(503);
  });

  it("200 avec assetId quand capture OK", async () => {
    captureFn.mockResolvedValueOnce({
      asset: { id: "asset-1" },
      url: "https://cdn/foo.png",
      sizeBytes: 1024,
      mimeType: "image/png",
    });
    const { POST } = await import("@/app/api/v2/browser/[id]/capture/route");
    const res = await POST(
      makeReq() as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.assetId).toBe("asset-1");
    expect(body.url).toBe("https://cdn/foo.png");
    expect(body.sizeBytes).toBe(1024);
  });

  it("502 quand capture throw", async () => {
    captureFn.mockRejectedValueOnce(new Error("boom"));
    const { POST } = await import("@/app/api/v2/browser/[id]/capture/route");
    const res = await POST(
      makeReq() as never,
      { params: Promise.resolve({ id: "sess" }) },
    );
    expect(res.status).toBe(502);
  });
});
