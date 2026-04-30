/**
 * @vitest-environment node
 *
 * AssetProvenance B4 — vérifie que les nouveaux champs (derivedFrom,
 * sourceUrls, costUsd, latencyMs, modelUsed, runId, missionId) sont bien
 * typés en optional et n'invalident pas un asset historique sans eux.
 */

import { describe, it, expect } from "vitest";
import type { Asset, AssetProvenance } from "@/lib/assets/types";

describe("AssetProvenance B4 lineage", () => {
  it("accepts a legacy asset without lineage fields", () => {
    const asset: Asset = {
      id: "a1",
      threadId: "t1",
      kind: "report",
      title: "Legacy",
      provenance: { providerId: "system" },
      createdAt: Date.now(),
    };
    expect(asset.provenance.derivedFrom).toBeUndefined();
    expect(asset.provenance.costUsd).toBeUndefined();
  });

  it("accepts an enriched provenance with all B4 fields", () => {
    const prov: AssetProvenance = {
      providerId: "system",
      tenantId: "t",
      userId: "u",
      runId: "run-123",
      missionId: "mission-7",
      modelUsed: "claude-sonnet-4-6",
      costUsd: 0.042,
      latencyMs: 4200,
      derivedFrom: ["parent-1", "parent-2"],
      sourceUrls: [
        { url: "https://example.com", label: "Example", fetchedAt: 1700000000000 },
      ],
    };
    expect(prov.runId).toBe("run-123");
    expect(prov.derivedFrom).toHaveLength(2);
    expect(prov.sourceUrls?.[0]?.url).toBe("https://example.com");
    expect(prov.costUsd).toBeCloseTo(0.042);
  });

  it("preserves backward-compat with reportMeta + pdfFile", () => {
    const prov: AssetProvenance = {
      providerId: "system",
      reportMeta: { signals: [], severity: "info" },
      pdfFile: {
        storageKind: "file",
        fileName: "x.pdf",
        mimeType: "application/pdf",
        filePath: "/tmp/x.pdf",
        sizeBytes: 1234,
      },
      modelUsed: "fal-ai/flux/schnell",
    };
    expect(prov.reportMeta?.severity).toBe("info");
    expect(prov.pdfFile?.fileName).toBe("x.pdf");
    expect(prov.modelUsed).toBe("fal-ai/flux/schnell");
  });
});
