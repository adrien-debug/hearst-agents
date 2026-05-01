/**
 * Daily Brief API routes — auth + idempotence + happy path.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  enqueueJob: vi.fn(),
  loadDailyBriefForDate: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: mocks.requireScope,
}));

vi.mock("@/lib/jobs/queue", () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock("@/lib/daily-brief/store", () => ({
  loadDailyBriefForDate: mocks.loadDailyBriefForDate,
}));

const SCOPE = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  isDevFallback: false,
};

function makeReq(url: string, body?: unknown): NextRequest {
  return new NextRequest(new URL(url, "http://localhost"), {
    method: body ? "POST" : "GET",
    body: body ? JSON.stringify(body) : null,
    headers: body ? { "content-type": "application/json" } : undefined,
  });
}

describe("POST /api/v2/daily-brief/generate", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireScope.mockResolvedValue({ scope: SCOPE, error: null });
    mocks.loadDailyBriefForDate.mockResolvedValue(null);
    mocks.enqueueJob.mockResolvedValue({ jobId: "job-1", jobKind: "daily-brief" });
  });

  it("401 si pas authentifié", async () => {
    mocks.requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const { POST } = await import("@/app/api/v2/daily-brief/generate/route");
    const res = await POST(makeReq("http://localhost/x", {}));
    expect(res.status).toBe(401);
  });

  it("retourne 200 + status=exists si brief existe déjà pour cette date", async () => {
    mocks.loadDailyBriefForDate.mockResolvedValue({
      assetId: "existing-id",
      title: "x",
      summary: null,
      createdAt: 1000,
      narration: { lead: "x", people: "x", decisions: "x", signals: "x", costUsd: 0 },
      meta: {
        totalItems: 5,
        sources: ["gmail"],
        targetDate: "2026-05-01",
        pdfUrl: "https://example.com/pdf",
        storageKey: "k",
        pdfSizeBytes: 1000,
      },
      counts: { emails: 5, slack: 0, calendar: 0, github: 0, linear: 0 },
      pdfUrl: "https://example.com/pdf",
    });
    const { POST } = await import("@/app/api/v2/daily-brief/generate/route");
    const res = await POST(
      makeReq("http://localhost/x", { targetDate: "2026-05-01" }),
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("exists");
    expect(body.assetId).toBe("existing-id");
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });

  it("202 + jobId au happy path enqueue", async () => {
    const { POST } = await import("@/app/api/v2/daily-brief/generate/route");
    const res = await POST(makeReq("http://localhost/x", {}));
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job-1");
    expect(body.status).toBe("pending");
    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    const payload = mocks.enqueueJob.mock.calls[0][0] as Record<string, unknown>;
    expect(payload.jobKind).toBe("daily-brief");
    expect(payload.userId).toBe("user-1");
    expect(payload.trigger).toBe("manual");
  });

  it("ignore targetDate invalide et utilise aujourd'hui", async () => {
    const { POST } = await import("@/app/api/v2/daily-brief/generate/route");
    await POST(
      makeReq("http://localhost/x", { targetDate: "not-a-date" }),
    );
    const today = new Date().toISOString().slice(0, 10);
    expect(mocks.loadDailyBriefForDate).toHaveBeenCalledWith(
      expect.objectContaining({ targetDate: today }),
    );
  });
});

describe("GET /api/v2/daily-brief/today", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireScope.mockResolvedValue({ scope: SCOPE, error: null });
  });

  it("401 si pas authentifié", async () => {
    mocks.requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const { GET } = await import("@/app/api/v2/daily-brief/today/route");
    const res = await GET(makeReq("http://localhost/x"));
    expect(res.status).toBe(401);
  });

  it("retourne brief: null si aucun brief pour aujourd'hui", async () => {
    mocks.loadDailyBriefForDate.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v2/daily-brief/today/route");
    const res = await GET(makeReq("http://localhost/api/v2/daily-brief/today"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief).toBeNull();
  });

  it("retourne brief si trouvé", async () => {
    mocks.loadDailyBriefForDate.mockResolvedValue({
      assetId: "abc",
      title: "Daily Brief · 1 mai",
      summary: "5 signaux",
      createdAt: 1000,
      narration: {
        lead: "Lead text",
        people: "p",
        decisions: "d",
        signals: "s",
        costUsd: 0.05,
      },
      meta: {
        totalItems: 5,
        sources: ["gmail"],
        targetDate: "2026-05-01",
        pdfUrl: "https://e.com/p",
        storageKey: "k",
        pdfSizeBytes: 1000,
      },
      counts: { emails: 5, slack: 0, calendar: 0, github: 0, linear: 0 },
      pdfUrl: "https://e.com/p",
    });
    const { GET } = await import("@/app/api/v2/daily-brief/today/route");
    const res = await GET(makeReq("http://localhost/api/v2/daily-brief/today"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.brief.assetId).toBe("abc");
    expect(body.brief.narration.lead).toBe("Lead text");
  });

  it("accepte date param valide", async () => {
    mocks.loadDailyBriefForDate.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v2/daily-brief/today/route");
    await GET(makeReq("http://localhost/api/v2/daily-brief/today?date=2026-04-30"));
    expect(mocks.loadDailyBriefForDate).toHaveBeenCalledWith({
      userId: "user-1",
      targetDate: "2026-04-30",
    });
  });

  it("ignore date param malformé", async () => {
    mocks.loadDailyBriefForDate.mockResolvedValue(null);
    const { GET } = await import("@/app/api/v2/daily-brief/today/route");
    await GET(makeReq("http://localhost/api/v2/daily-brief/today?date=invalid"));
    expect(mocks.loadDailyBriefForDate).toHaveBeenCalledWith({
      userId: "user-1",
      targetDate: undefined,
    });
  });
});
