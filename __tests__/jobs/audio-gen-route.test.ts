/**
 * POST /api/v2/jobs/audio-gen — couvre :
 *  - 503 si ELEVENLABS_API_KEY manquant
 *  - 401 si pas de scope
 *  - 400 si text manquant
 *  - 402 si crédits insuffisants
 *  - 202 + jobId au happy path
 *  - 503 + refund si enqueueJob throw
 */

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
vi.mock("@/lib/capabilities/providers/elevenlabs", () => ({
  estimateSpeechCost: () => 0.01,
}));

import { POST } from "@/app/api/v2/jobs/audio-gen/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/v2/jobs/audio-gen", {
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

describe("POST /api/v2/jobs/audio-gen", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.ELEVENLABS_API_KEY;
    process.env.ELEVENLABS_API_KEY = "el-test-key";

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
      estimatedCostUsd: 0.01,
    });
    createVariant.mockResolvedValue("variant-1");
    updateVariant.mockResolvedValue(undefined);
    enqueueJob.mockResolvedValue({ jobId: "job-1", jobKind: "audio-gen" });
    settleCredits.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ELEVENLABS_API_KEY;
    else process.env.ELEVENLABS_API_KEY = originalKey;
  });

  it("503 quand ELEVENLABS_API_KEY manquant", async () => {
    delete process.env.ELEVENLABS_API_KEY;
    const res = await POST(makeReq({ text: "Bonjour" }) as never);
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("elevenlabs_unavailable");
  });

  it("401 si requireScope échoue", async () => {
    requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const res = await POST(makeReq({ text: "Bonjour" }) as never);
    expect(res.status).toBe(401);
  });

  it("400 si text vide", async () => {
    const res = await POST(makeReq({ text: "" }) as never);
    expect(res.status).toBe(400);
  });

  it("402 si crédits insuffisants", async () => {
    requireCreditsForJob.mockResolvedValue({
      allowed: false,
      availableUsd: 0,
      estimatedCostUsd: 0.01,
    });
    const res = await POST(makeReq({ text: "Bonjour" }) as never);
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.error).toBe("insufficient_credits");
  });

  it("202 + jobId au happy path ; payload audio-gen correctement formé", async () => {
    const res = await POST(
      makeReq({ text: "Salut le monde", threadId: "thread-1" }) as never,
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job-1");
    expect(body.assetId).toBeTruthy();
    expect(body.variantId).toBe("variant-1");
    expect(body.status).toBe("pending");

    expect(enqueueJob).toHaveBeenCalledTimes(1);
    const payload = enqueueJob.mock.calls[0][0];
    expect(payload.jobKind).toBe("audio-gen");
    expect(payload.text).toBe("Salut le monde");
    expect(payload.userId).toBe("user-1");
    expect(payload.variantId).toBe("variant-1");
  });

  it("503 + refund + variant failed quand enqueue throw", async () => {
    enqueueJob.mockRejectedValue(new Error("redis down"));
    const res = await POST(makeReq({ text: "Bonjour" }) as never);
    expect(res.status).toBe(503);
    expect(settleCredits).toHaveBeenCalledTimes(1);
    expect(updateVariant).toHaveBeenCalledWith(
      "variant-1",
      expect.objectContaining({ status: "failed" }),
    );
  });
});
