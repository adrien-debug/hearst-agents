/**
 * POST /api/v2/meetings/start — couvre :
 *  - 503 si RECALL_API_KEY absent
 *  - 401 sans scope
 *  - 400 si meetingUrl invalide
 *  - 202 + meetingId au happy path (asset persisté + job enqueué)
 *  - 202 quand l'enqueue échoue (Redis down) — fail-soft
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const {
  requireScope,
  createMeetingBot,
  storeAsset,
  enqueueJob,
} = vi.hoisted(() => ({
  requireScope: vi.fn(),
  createMeetingBot: vi.fn(),
  storeAsset: vi.fn(),
  enqueueJob: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({ requireScope }));
vi.mock("@/lib/capabilities/providers/recall-ai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/capabilities/providers/recall-ai")>(
    "@/lib/capabilities/providers/recall-ai",
  );
  return {
    ...actual,
    createMeetingBot,
  };
});
vi.mock("@/lib/assets/types", () => ({ storeAsset }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob }));

import { POST } from "@/app/api/v2/meetings/start/route";

function makeReq(body: unknown): Request {
  return new Request("http://localhost/api/v2/meetings/start", {
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

describe("POST /api/v2/meetings/start", () => {
  let originalKey: string | undefined;

  beforeEach(() => {
    originalKey = process.env.RECALL_API_KEY;
    process.env.RECALL_API_KEY = "rk-test-1";

    requireScope.mockReset();
    createMeetingBot.mockReset();
    storeAsset.mockReset();
    enqueueJob.mockReset();

    requireScope.mockResolvedValue({ scope: SCOPE, error: null });
    createMeetingBot.mockResolvedValue({
      botId: "bot-abc",
      status: "joining",
      meetingUrl: "https://meet.google.com/abc-defg-hij",
    });
    storeAsset.mockResolvedValue(undefined);
    enqueueJob.mockResolvedValue({ jobId: "job-1", jobKind: "meeting-bot" });
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.RECALL_API_KEY;
    else process.env.RECALL_API_KEY = originalKey;
  });

  it("503 quand RECALL_API_KEY manquant", async () => {
    delete process.env.RECALL_API_KEY;
    const res = await POST(
      makeReq({ meetingUrl: "https://meet.google.com/abc-defg-hij" }) as never,
    );
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.error).toBe("recall_ai_unavailable");
  });

  it("401 si requireScope échoue", async () => {
    requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const res = await POST(
      makeReq({ meetingUrl: "https://meet.google.com/abc-defg-hij" }) as never,
    );
    expect(res.status).toBe(401);
  });

  it("400 si meetingUrl absent", async () => {
    const res = await POST(makeReq({}) as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_meeting_url");
  });

  it("400 si URL non supportée (provider unknown)", async () => {
    const res = await POST(
      makeReq({ meetingUrl: "https://example.com/foo" }) as never,
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.reason).toBe("unsupported_provider");
  });

  it("202 happy path : asset persisté + job enqueué + meetingId retourné", async () => {
    const res = await POST(
      makeReq({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        language: "fr",
      }) as never,
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.meetingId).toBe("bot-abc");
    expect(body.jobId).toBe("job-1");
    expect(body.provider).toBe("google_meet");
    expect(createMeetingBot).toHaveBeenCalledWith(
      expect.objectContaining({
        meetingUrl: "https://meet.google.com/abc-defg-hij",
        language: "fr",
      }),
    );
    expect(storeAsset).toHaveBeenCalledTimes(1);
    const asset = storeAsset.mock.calls[0][0];
    expect(asset.id).toBe("bot-abc");
    expect(asset.kind).toBe("event");
    expect(asset.provenance.providerId).toBe("system");
    expect(enqueueJob).toHaveBeenCalledTimes(1);
    expect(enqueueJob.mock.calls[0][0].assetId).toBe("bot-abc");
  });

  it("202 fail-soft quand enqueueJob throw (Redis down)", async () => {
    enqueueJob.mockRejectedValue(new Error("redis down"));
    const res = await POST(
      makeReq({ meetingUrl: "https://zoom.us/j/9999" }) as never,
    );
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.meetingId).toBe("bot-abc");
    expect(body.jobId).toBeNull();
  });
});
