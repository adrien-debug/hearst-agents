/**
 * Tests export XLSX — on génère un buffer ZIP (XLSX = container OOXML),
 * on vérifie que les sheets attendus sont créés en re-parseant via exceljs.
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportXlsx } from "@/lib/reports/export/xlsx";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";
import type { ReportMeta } from "@/lib/reports/spec/schema";

const meta: ReportMeta = {
  title: "Test Report XLSX",
  summary: "",
  domain: "founder",
  persona: "founder",
  cadence: "ad-hoc",
  confidentiality: "internal",
};

const payload: RenderPayload = {
  __reportPayload: true,
  specId: "spec-x",
  version: 2,
  generatedAt: 1_700_000_000_000,
  blocks: [
    {
      id: "kpi_revenue",
      type: "kpi",
      label: "Revenue",
      layout: { col: 1, row: 0 },
      data: { value: 100, delta: 5 },
      props: {},
    },
    {
      id: "table_clients",
      type: "table",
      label: "Clients",
      layout: { col: 4, row: 1 },
      data: [
        { name: "A", value: 1 },
        { name: "B", value: 2 },
      ],
      props: {},
    },
    {
      id: "viz_radar",
      type: "radar",
      label: "Radar",
      layout: { col: 4, row: 2 },
      data: [],
      props: { axes: ["x", "y", "z"], series: [{ label: "s1", values: [1, 2, 3] }] },
    },
  ],
  scalars: {},
};

describe("exportXlsx", () => {
  it("génère un buffer XLSX avec sheets Meta + Charts + un par bloc tabulaire", async () => {
    const result = await exportXlsx({
      payload,
      meta,
      narration: "Quelques observations rapides",
      fileName: "test_xlsx",
    });
    expect(result.buffer.length).toBeGreaterThan(0);
    expect(result.contentType).toContain("spreadsheetml");
    expect(result.fileName.endsWith(".xlsx")).toBe(true);

    // Re-parse avec exceljs pour vérifier les sheets attendus
    const workbook = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs attend l'ancien Buffer non-générique, Node 22 retourne Buffer<ArrayBuffer>
    await workbook.xlsx.load(Buffer.from(result.buffer));
    const names = workbook.worksheets.map((s) => s.name);
    expect(names).toContain("Meta");
    expect(names).toContain("Charts");
    // un onglet par bloc tabulaire (kpi + table)
    const tabularSheets = names.filter((n) => n !== "Meta" && n !== "Charts");
    expect(tabularSheets.length).toBeGreaterThanOrEqual(2);
  });

  it("Meta sheet contient titre, spec_id, version, narration", async () => {
    const result = await exportXlsx({
      payload,
      meta,
      narration: "Narration_X",
    });
    const wb = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs attend l'ancien Buffer non-générique, Node 22 retourne Buffer<ArrayBuffer>
    await wb.xlsx.load(Buffer.from(result.buffer));
    const meta_ = wb.getWorksheet("Meta");
    expect(meta_).toBeTruthy();
    if (!meta_) return;

    const rows: string[] = [];
    meta_.eachRow((row) => {
      rows.push(row.values?.toString() ?? "");
    });
    const flat = rows.join("|");
    expect(flat).toContain("Test Report XLSX");
    expect(flat).toContain("spec-x");
    expect(flat).toContain("Narration_X");
  });

  it("renseigne la sheet Charts pour un bloc non-tabulaire (radar)", async () => {
    const result = await exportXlsx({ payload, meta, narration: null });
    const wb = new ExcelJS.Workbook();
    // @ts-expect-error -- exceljs attend l'ancien Buffer non-générique, Node 22 retourne Buffer<ArrayBuffer>
    await wb.xlsx.load(Buffer.from(result.buffer));
    const charts = wb.getWorksheet("Charts");
    expect(charts).toBeTruthy();
    if (!charts) return;
    let foundRadar = false;
    charts.eachRow((row) => {
      const v = row.values?.toString() ?? "";
      if (v.includes("viz_radar")) foundRadar = true;
    });
    expect(foundRadar).toBe(true);
  });
});
