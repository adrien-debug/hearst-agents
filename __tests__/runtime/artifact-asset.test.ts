/**
 * Vérifie le shape de l'asset persisté par /api/v2/jobs/code-exec :
 *   - kind === "artifact"
 *   - contentRef contient le code (cap 50KB)
 *   - provenance.providerId === "system" (e2b n'est pas dans PROVIDER_IDS,
 *     et le worker traque le provider via metadata.runtime + variants)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

const { storeAssetMock, createVariantMock, enqueueJobMock, requireCreditsMock } = vi.hoisted(() => ({
  storeAssetMock: vi.fn().mockResolvedValue(undefined),
  createVariantMock: vi.fn().mockResolvedValue("variant-id"),
  enqueueJobMock: vi.fn().mockResolvedValue({ jobId: "job-1" }),
  requireCreditsMock: vi.fn().mockResolvedValue({ allowed: true }),
}));

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: {
      userId: "user-1",
      tenantId: "tenant-1",
      workspaceId: "ws-1",
      isDevFallback: false,
    },
    error: null,
  })),
}));

vi.mock("@/lib/assets/types", () => ({
  storeAsset: storeAssetMock,
}));

vi.mock("@/lib/assets/variants", () => ({
  createVariant: createVariantMock,
  updateVariant: vi.fn(),
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: enqueueJobMock,
}));

vi.mock("@/lib/credits/middleware", () => ({
  requireCreditsForJob: requireCreditsMock,
  formatInsufficientCreditsMessage: vi.fn(() => "no credits"),
}));

vi.mock("@/lib/credits/client", () => ({
  settleCredits: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  storeAssetMock.mockClear();
  createVariantMock.mockClear();
  enqueueJobMock.mockClear().mockResolvedValue({ jobId: "job-1" });
  requireCreditsMock.mockClear().mockResolvedValue({ allowed: true });
  process.env.E2B_API_KEY = "fake-key";
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeReq(body: unknown): any {
  return new Request("http://localhost/api/v2/jobs/code-exec", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/v2/jobs/code-exec — artifact provenance", () => {
  it("persiste un asset kind='artifact' avec le code dans contentRef", async () => {
    const { POST } = await import("@/app/api/v2/jobs/code-exec/route");
    const code = "print('hello hearst')";
    const res = await POST(makeReq({ code, runtime: "python" }));
    expect(res.status).toBe(202);

    expect(storeAssetMock).toHaveBeenCalledTimes(1);
    const asset = storeAssetMock.mock.calls[0][0];
    expect(asset.kind).toBe("artifact");
    expect(asset.contentRef).toBe(code);
    expect(asset.provenance.providerId).toBe("system");
    expect(asset.provenance.userId).toBe("user-1");

    expect(createVariantMock).toHaveBeenCalledWith({
      assetId: asset.id,
      kind: "code",
      status: "pending",
      provider: "e2b",
    });

    expect(enqueueJobMock).toHaveBeenCalledTimes(1);
    const enq = enqueueJobMock.mock.calls[0][0];
    expect(enq.jobKind).toBe("code-exec");
    expect(enq.code).toBe(code);
    expect(enq.runtime).toBe("python");
  });

  it("503 si E2B_API_KEY absent", async () => {
    delete process.env.E2B_API_KEY;
    const { POST } = await import("@/app/api/v2/jobs/code-exec/route");
    const res = await POST(makeReq({ code: "x = 1", runtime: "python" }));
    expect(res.status).toBe(503);
  });
});
