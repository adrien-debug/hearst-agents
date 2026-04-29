/**
 * Tests export PDF — sanity check : on génère un buffer non-vide,
 * commençant par la signature PDF "%PDF-".
 *
 * On ne valide PAS le rendu visuel (hors scope tests unitaires) — pour ça,
 * une éventuelle suite Playwright avec PDF visual diff serait l'option.
 */

import { describe, it, expect } from "vitest";
import { exportPdf } from "@/lib/reports/export/pdf";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";

const meta: ReportMeta = {
  title: "Test Report PDF",
  summary: "Suite de tests automatisée",
  domain: "founder",
  persona: "founder",
  cadence: "ad-hoc",
  confidentiality: "internal",
};

const payload: RenderPayload = {
  __reportPayload: true,
  specId: "spec-test",
  version: 1,
  generatedAt: 1_700_000_000_000,
  blocks: [
    {
      id: "kpi_arr",
      type: "kpi",
      label: "ARR",
      layout: { col: 1, row: 0 },
      data: { value: 120_000, delta: 12.5, sparkline: [100, 110, 120] },
      props: { format: "currency", currency: "EUR" },
    },
    {
      id: "table_top",
      type: "table",
      label: "Top clients",
      layout: { col: 4, row: 1 },
      data: [
        { name: "ACME", arr: 50_000 },
        { name: "Globex", arr: 30_000 },
      ],
      props: { columns: ["name", "arr"] },
    },
  ],
  scalars: { "kpi_arr.value": 120_000 },
};

describe("exportPdf", () => {
  it("génère un buffer PDF non-vide", async () => {
    const result = await exportPdf({
      payload,
      meta,
      narration: "Le mois est plutôt bon, ARR en hausse.",
      fileName: meta.title,
    });
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.size).toBe(result.buffer.length);
    expect(result.contentType).toBe("application/pdf");
    expect(result.fileName.endsWith(".pdf")).toBe(true);
    // signature PDF
    expect(result.buffer.subarray(0, 5).toString("ascii")).toBe("%PDF-");
  });

  it("supporte un payload sans narration", async () => {
    const result = await exportPdf({
      payload,
      meta,
      narration: null,
      fileName: "no_narration",
    });
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("ne crash pas sur un block primitive non rendu graphiquement", async () => {
    const result = await exportPdf({
      payload: {
        ...payload,
        blocks: [
          {
            id: "unknown_block",
            type: "sankey",
            label: "Sankey indisponible en PDF",
            layout: { col: 4, row: 0 },
            data: [],
            props: { nodes: [], links: [] },
          },
        ],
      },
      meta,
      narration: null,
    });
    expect(result.buffer.length).toBeGreaterThan(0);
  });

  it("sanitize le nom de fichier", async () => {
    const result = await exportPdf({
      payload,
      meta,
      narration: null,
      fileName: "Mon rapport / 2026 ! ?",
    });
    expect(result.fileName).toMatch(/^[a-zA-Z0-9_-]+\.pdf$/);
  });
});
