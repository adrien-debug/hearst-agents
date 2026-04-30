/**
 * lib/browser/screenshot — capture, persistExtraction, persistSessionReport.
 *
 * On mock le storage et on bypass le fetch via `bufferOverride`.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { Buffer } from "node:buffer";

const uploadFn = vi.fn(async (key: string, buf: Buffer) => ({
  url: `https://cdn.test/${key}`,
  size: buf.length,
  key,
}));

vi.mock("@/lib/engine/runtime/assets/storage", () => ({
  getGlobalStorage: () => ({
    upload: uploadFn,
  }),
}));

import {
  captureScreenshot,
  persistExtraction,
  persistSessionReport,
} from "@/lib/browser/screenshot";
import { getAsset, clearAllAssets } from "@/lib/engine/runtime/assets/create-asset";

const scope = {
  userId: "user-1",
  tenantId: "tenant-1",
  workspaceId: "ws-1",
};

describe("captureScreenshot", () => {
  beforeEach(() => {
    uploadFn.mockClear();
    clearAllAssets();
  });

  it("upload + crée un asset avec metadata.kind=screenshot", async () => {
    const buf = Buffer.from([0x89, 0x50, 0x4e, 0x47]); // PNG header
    const result = await captureScreenshot("sess-abc", scope, {
      bufferOverride: buf,
    });

    expect(uploadFn).toHaveBeenCalledOnce();
    expect(result.mimeType).toBe("image/png");
    expect(result.sizeBytes).toBe(4);
    expect(result.url).toContain("browser-captures/sess-abc");

    const stored = getAsset(result.asset.id);
    expect(stored).toBeDefined();
    expect(stored?.metadata?.kind).toBe("screenshot");
    expect(stored?.metadata?.sessionId).toBe("sess-abc");
    expect(stored?.userId).toBe("user-1");
  });
});

describe("persistExtraction", () => {
  it("stocke un asset JSON kind=extract", async () => {
    const asset = await persistExtraction(
      "sess-1",
      { title: "Hello" },
      scope,
      { instruction: "extract title", schema: { title: "string" } },
    );
    expect(asset.type).toBe("json");
    expect(asset.metadata?.kind).toBe("extract");
    expect(asset.metadata?.data).toEqual({ title: "Hello" });
  });
});

describe("persistSessionReport", () => {
  it("stocke un asset report kind=browser_session_report", async () => {
    const asset = await persistSessionReport("sess-1", scope, {
      summary: "ok",
      totalActions: 5,
      totalDurationMs: 1234,
      assetIds: ["a1", "a2"],
    });
    expect(asset.type).toBe("report");
    expect(asset.metadata?.kind).toBe("browser_session_report");
    expect(asset.metadata?.totalActions).toBe(5);
  });
});
