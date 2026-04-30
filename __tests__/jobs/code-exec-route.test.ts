import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  requireScope,
  storeAsset,
  createVariant,
  updateVariant,
  enqueueJob,
  requireCreditsForJob,
  settleCredits,
} = vi.hoisted(() => ({
  requireScope: vi.fn(),
  storeAsset: vi.fn(),
  createVariant: vi.fn(),
  updateVariant: vi.fn(),
  enqueueJob: vi.fn(),
  requireCreditsForJob: vi.fn(),
  settleCredits: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({ requireScope }));
vi.mock("@/lib/assets/types", () => ({ storeAsset }));
vi.mock("@/lib/assets/variants", () => ({ createVariant, updateVariant }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob }));
vi.mock("@/lib/credits/middleware", () => ({
  requireCreditsForJob,
  formatInsufficientCreditsMessage: () => "Solde insuffisant",
}));
vi.mock("@/lib/credits/client", () => ({ settleCredits }));

import { POST } from "@/app/api/v2/jobs/code-exec/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/v2/jobs/code-exec", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const SCOPE = {
  userId: "user-1",
  tenantId: "t-1",
  workspaceId: "w-1",
  isDevFallback: false,
};

describe("POST /api/v2/jobs/code-exec", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.E2B_API_KEY;
    process.env.E2B_API_KEY = "e2b-test-key";

    requireScope.mockReset();
    storeAsset.mockReset();
    createVariant.mockReset();
    updateVariant.mockReset();
    enqueueJob.mockReset();
    requireCreditsForJob.mockReset();
    settleCredits.mockReset();

    requireScope.mockResolvedValue({ scope: SCOPE, error: null });
    requireCreditsForJob.mockResolvedValue({
      allowed: true,
      availableUsd: 10,
      estimatedCostUsd: 0.002,
    });
    createVariant.mockResolvedValue("variant-1");
    updateVariant.mockResolvedValue(undefined);
    enqueueJob.mockResolvedValue({ jobId: "job-1", jobKind: "code-exec" });
    settleCredits.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.E2B_API_KEY;
    else process.env.E2B_API_KEY = originalKey;
  });

  it("503 quand E2B_API_KEY manquant", async () => {
    delete process.env.E2B_API_KEY;
    const res = await POST(makeReq({ code: "print('hi')" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("e2b_unavailable");
  });

  it("401 si requireScope échoue", async () => {
    requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const res = await POST(makeReq({ code: "print('hi')" }) as never);
    expect(res.status).toBe(401);
  });

  it("400 si code vide", async () => {
    const res = await POST(makeReq({ code: "" }) as never);
    expect(res.status).toBe(400);
  });

  it("402 si crédits insuffisants", async () => {
    requireCreditsForJob.mockResolvedValue({
      allowed: false,
      availableUsd: 0,
      estimatedCostUsd: 0.002,
    });
    const res = await POST(makeReq({ code: "print('hi')" }) as never);
    expect(res.status).toBe(402);
  });

  it("202 + payload code-exec correctement formé", async () => {
    const res = await POST(
      makeReq({ code: "print(2+2)", runtime: "python" }) as never,
    );
    expect(res.status).toBe(202);
    const payload = enqueueJob.mock.calls[0][0];
    expect(payload.jobKind).toBe("code-exec");
    expect(payload.code).toBe("print(2+2)");
    expect(payload.runtime).toBe("python");
    expect(payload.variantId).toBe("variant-1");
  });

  it("503 + refund + variant failed quand enqueue throw", async () => {
    enqueueJob.mockRejectedValue(new Error("redis down"));
    const res = await POST(makeReq({ code: "print('hi')" }) as never);
    expect(res.status).toBe(503);
    expect(settleCredits).toHaveBeenCalledTimes(1);
    expect(updateVariant).toHaveBeenCalledWith(
      "variant-1",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
