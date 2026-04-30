/**
 * @vitest-environment node
 *
 * /api/v2/assets/diff — fallback déterministe.
 * On stub loadAssetById et requireScope pour éviter le call DB.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/platform/auth/scope", () => ({
  requireScope: vi.fn(async () => ({
    scope: { tenantId: "t", workspaceId: "w", userId: "u" },
  })),
}));

vi.mock("@/lib/assets/types", () => ({
  loadAssetById: vi.fn(),
}));

import { loadAssetById } from "@/lib/assets/types";
import { POST } from "@/app/api/v2/assets/diff/route";

describe("POST /api/v2/assets/diff", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.ANTHROPIC_API_KEY;
  });

  it("retourne 404 si un asset est introuvable", async () => {
    (loadAssetById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    (loadAssetById as ReturnType<typeof vi.fn>).mockResolvedValueOnce(null);
    const req = new Request("http://x/api/v2/assets/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIdA: "a", assetIdB: "b" }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(404);
  });

  it("retourne un diff naïf déterministe quand ANTHROPIC_API_KEY absent", async () => {
    const baseProv = { providerId: "system" } as const;
    (loadAssetById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "a",
      threadId: "t",
      kind: "report",
      title: "Asset A",
      provenance: { ...baseProv, modelUsed: "claude-sonnet-4-6" },
      createdAt: 0,
      contentRef: "abcdef",
    });
    (loadAssetById as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "b",
      threadId: "t",
      kind: "brief",
      title: "Asset B",
      provenance: { ...baseProv, modelUsed: "claude-sonnet-4-6" },
      createdAt: 0,
      contentRef: "abcdefghij",
    });
    const req = new Request("http://x/api/v2/assets/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assetIdA: "a", assetIdB: "b" }),
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.summary).toContain("Asset A");
    expect(json.differences.some((d: { kind: string }) => d.kind === "title")).toBe(true);
    expect(json.differences.some((d: { kind: string }) => d.kind === "kind")).toBe(true);
    expect(json.differences.some((d: { kind: string }) => d.kind === "content_size")).toBe(true);
  });

  it("retourne 400 sur body invalide", async () => {
    const req = new Request("http://x/api/v2/assets/diff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const res = await POST(req as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });
});
