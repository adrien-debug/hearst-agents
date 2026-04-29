/**
 * Tests export PDF — génération basique + fallback bloc graphique.
 */

import { describe, it, expect } from "vitest";
import { exportPdf } from "@/lib/reports/export/pdf";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";

const META: ReportMeta = {
  title: "Cockpit founder",
  summary: "Snapshot mensuel",
  domain: "founder",
  persona: "founder",
  cadence: "monthly",
  confidentiality: "internal",
};

function buildPayload(): RenderPayload {
  return {
    __reportPayload: true,
    specId: "00000000-0000-4000-8000-000000000099",
    version: 1,
    generatedAt: 1_700_000_000_000,
    blocks: [
      {
        id: "kpi_mrr",
        type: "kpi",
        label: "MRR",
        layout: { col: 1, row: 0 },
        data: { value: 12345, delta: 12.4, sparkline: null },
        props: {},
      },
      {
        id: "tbl",
        type: "table",
        label: "Customers",
        layout: { col: 4, row: 1 },
        data: [
          { id: 1, name: "Alice", mrr: 100 },
          { id: 2, name: "Bob", mrr: 200 },
        ],
        props: {},
      },
      {
        id: "spk",
        type: "sparkline",
        layout: { col: 2, row: 2 },
        data: [],
        props: {},
      },
    ],
    scalars: {},
  };
}

describe("exportPdf", () => {
  it("génère un buffer PDF valide", async () => {
    const result = await exportPdf({
      payload: buildPayload(),
      meta: META,
      narration: "Tout va bien.",
    });
    expect(result.contentType).toBe("application/pdf");
    expect(result.size).toBeGreaterThan(0);
    // PDF magic header
    expect(result.buffer.slice(0, 4).toString("utf8")).toBe("%PDF");
    expect(result.fileName.endsWith(".pdf")).toBe(true);
  });

  it("ne crash pas sur un bloc graphique sans data tabulaire (fallback)", async () => {
    const result = await exportPdf({
      payload: buildPayload(),
      meta: META,
      narration: null,
    });
    expect(result.size).toBeGreaterThan(0);
  });

  it("nettoie les caractères invalides du fileName", async () => {
    const result = await exportPdf({
      payload: buildPayload(),
      meta: { ...META, title: "Hello / World :: Report" },
    });
    expect(result.fileName).not.toContain("/");
    expect(result.fileName).not.toContain(":");
  });
});
