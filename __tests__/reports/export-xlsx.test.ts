/**
 * Tests export XLSX — structure des feuilles, types blocs, meta sheet.
 */

import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { exportXlsx } from "@/lib/reports/export/xlsx";
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
        data: { value: 12345, delta: 12.4, sparkline: [1, 2, 3] },
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
        props: { points: [1, 2, 3] },
      },
    ],
    scalars: {},
  };
}

async function readWorkbook(buffer: Buffer): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  // exceljs.xlsx.load attend ExcelJS.Buffer (≈ Buffer Node), on passe ArrayBuffer pour matcher.
  const ab = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength,
  );
  await wb.xlsx.load(ab as ArrayBuffer);
  return wb;
}

describe("exportXlsx", () => {
  it("génère un buffer XLSX valide", async () => {
    const result = await exportXlsx({
      payload: buildPayload(),
      meta: META,
      narration: "Une narration.",
    });
    expect(result.contentType).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(result.size).toBeGreaterThan(0);
    expect(result.fileName.endsWith(".xlsx")).toBe(true);
  });

  it("contient une feuille Meta avec les bonnes clés", async () => {
    const result = await exportXlsx({
      payload: buildPayload(),
      meta: META,
      narration: "narration test",
    });
    const wb = await readWorkbook(result.buffer);
    const meta = wb.getWorksheet("Meta");
    expect(meta).toBeDefined();
    if (!meta) return;
    const fields: string[] = [];
    meta.eachRow((row, idx) => {
      if (idx === 1) return; // header
      fields.push(String(row.getCell(1).value));
    });
    expect(fields).toContain("Titre");
    expect(fields).toContain("Persona");
    expect(fields).toContain("Cadence");
    expect(fields).toContain("Narration");
  });

  it("crée une feuille par bloc tabulaire (table → onglet)", async () => {
    const result = await exportXlsx({
      payload: buildPayload(),
      meta: META,
    });
    const wb = await readWorkbook(result.buffer);
    const customers = wb.getWorksheet("Customers");
    expect(customers).toBeDefined();
    if (!customers) return;
    // Header (row 1) + 2 data rows
    expect(customers.rowCount).toBeGreaterThanOrEqual(3);
  });

  it("met les blocs non-tabulaires dans la feuille Charts", async () => {
    const result = await exportXlsx({
      payload: buildPayload(),
      meta: META,
    });
    const wb = await readWorkbook(result.buffer);
    const charts = wb.getWorksheet("Charts");
    expect(charts).toBeDefined();
    if (!charts) return;
    let foundSparkline = false;
    charts.eachRow((row, idx) => {
      if (idx === 1) return;
      if (String(row.getCell(2).value) === "sparkline") foundSparkline = true;
    });
    expect(foundSparkline).toBe(true);
  });

  it("KPI block produit une feuille avec value/delta", async () => {
    const result = await exportXlsx({
      payload: buildPayload(),
      meta: META,
    });
    const wb = await readWorkbook(result.buffer);
    const kpi = wb.getWorksheet("MRR");
    expect(kpi).toBeDefined();
    if (!kpi) return;
    const valueRow = kpi.getRow(2);
    expect(String(valueRow.getCell(1).value)).toBe("value");
    expect(Number(valueRow.getCell(2).value)).toBe(12345);
  });
});
