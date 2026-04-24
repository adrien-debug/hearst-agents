import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAssetDetail } from "@/lib/runtime/assets/detail";
import type { RunRecord } from "@/lib/runtime/runs/types";
import type { PersistedRunRecord } from "@/lib/runtime/state/types";

const getAllRunsMock = vi.fn();
const getPersistedRunsMock = vi.fn();

vi.mock("@/lib/runtime/runs/store", () => ({
  getAllRuns: (limit?: number) => getAllRunsMock(limit),
}));

vi.mock("@/lib/runtime/state/adapter", () => ({
  getRuns: (params?: { userId?: string; tenantId?: string; workspaceId?: string; limit?: number }) => getPersistedRunsMock(params),
}));

vi.mock("@/lib/runtime/assets/file-storage", () => ({
  getAssetDownloadInfo: () => ({ exists: false }),
}));

function createMemoryRun(overrides: Partial<RunRecord> = {}): RunRecord {
  return {
    id: "run-memory",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    userId: "user-a",
    input: "Generate report",
    status: "completed",
    createdAt: Date.now(),
    events: [],
    assets: [{ id: "asset-1", name: "Scoped report", type: "report" }],
    ...overrides,
  };
}

function createPersistedRun(overrides: Partial<PersistedRunRecord> = {}): PersistedRunRecord {
  return {
    id: "run-persisted",
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    userId: "user-a",
    input: "Generate report",
    status: "completed",
    createdAt: Date.now(),
    assets: [{ id: "asset-1", name: "Scoped report", type: "report" }],
    ...overrides,
  };
}

describe("getAssetDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getAllRunsMock.mockReturnValue([]);
    getPersistedRunsMock.mockResolvedValue([]);
  });

  it("does not return an in-memory asset outside the requested scope", async () => {
    getAllRunsMock.mockReturnValue([
      createMemoryRun({
        userId: "other-user",
        tenantId: "tenant-b",
        workspaceId: "workspace-b",
      }),
    ]);

    const result = await getAssetDetail({
      assetId: "asset-1",
      userId: "user-a",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
    });

    expect(result).toBeNull();
  });

  it("skips persisted runs outside scope and returns the matching asset", async () => {
    getPersistedRunsMock.mockResolvedValue([
      createPersistedRun({
        id: "run-wrong-scope",
        tenantId: "tenant-b",
        workspaceId: "workspace-b",
      }),
      createPersistedRun({
        id: "run-right-scope",
        tenantId: "tenant-a",
        workspaceId: "workspace-a",
      }),
    ]);

    const result = await getAssetDetail({
      assetId: "asset-1",
      userId: "user-a",
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
    });

    expect(getPersistedRunsMock).toHaveBeenCalledWith({ userId: "user-a", limit: 100 });
    expect(result?.runId).toBe("run-right-scope");
    expect(result?.name).toBe("Scoped report");
  });
});
