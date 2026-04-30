/**
 * POST /api/v2/inbox/refresh — auth + enqueue + throttle.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireScope: vi.fn(),
  enqueueJob: vi.fn(),
  canEnqueueInboxFetch: vi.fn(),
  markInboxFetchEnqueued: vi.fn(),
}));

vi.mock("@/lib/platform/auth/scope", () => ({ requireScope: mocks.requireScope }));
vi.mock("@/lib/jobs/queue", () => ({ enqueueJob: mocks.enqueueJob }));
vi.mock("@/lib/jobs/scheduled/inbox-cron", () => ({
  canEnqueueInboxFetch: mocks.canEnqueueInboxFetch,
  markInboxFetchEnqueued: mocks.markInboxFetchEnqueued,
}));

const SCOPE = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
  isDevFallback: false,
};

describe("POST /api/v2/inbox/refresh", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((m) => m.mockReset());
    mocks.requireScope.mockResolvedValue({ scope: SCOPE, error: null });
    mocks.canEnqueueInboxFetch.mockReturnValue(true);
    mocks.enqueueJob.mockResolvedValue({ jobId: "job-1", jobKind: "inbox-fetch" });
  });

  it("401 si pas de scope", async () => {
    mocks.requireScope.mockResolvedValue({
      scope: null,
      error: { message: "not_authenticated", status: 401 },
    });
    const { POST } = await import("@/app/api/v2/inbox/refresh/route");
    const res = await POST();
    expect(res.status).toBe(401);
  });

  it("429 si throttled", async () => {
    mocks.canEnqueueInboxFetch.mockReturnValue(false);
    const { POST } = await import("@/app/api/v2/inbox/refresh/route");
    const res = await POST();
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.status).toBe("throttled");
  });

  it("202 + jobId au happy path", async () => {
    const { POST } = await import("@/app/api/v2/inbox/refresh/route");
    const res = await POST();
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.jobId).toBe("job-1");
    expect(body.status).toBe("pending");

    expect(mocks.enqueueJob).toHaveBeenCalledTimes(1);
    const payload = mocks.enqueueJob.mock.calls[0][0];
    expect(payload.jobKind).toBe("inbox-fetch");
    expect(payload.userId).toBe("user-1");
    expect(payload.trigger).toBe("manual");
    expect(mocks.markInboxFetchEnqueued).toHaveBeenCalledWith("user-1");
  });
});
