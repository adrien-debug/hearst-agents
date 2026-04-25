/**
 * Spreadsheet Generator — Architecture Finale
 *
 * Produces real .xlsx files using ExcelJS.
 * Generates a proper Excel workbook with headers, auto-width columns, and data rows.
 * Path: lib/engine/runtime/assets/generators/spreadsheet.ts
 */

import ExcelJS from "exceljs";
import { saveAssetFile } from "../file-storage";
import type { AssetFileInfo } from "../types";

interface GenerateSpreadsheetInput {
  tenantId: string;
  runId: string;
  assetId: string;
  title: string;
  rows: Record<string, unknown>[];
}

export async function generateSpreadsheetArtifact(
  input: GenerateSpreadsheetInput,
): Promise<AssetFileInfo> {
  if (!input.rows.length) {
    throw new Error("Cannot generate spreadsheet from empty rows");
  }

  const safeName = input.title.replace(/[^a-zA-Z0-9_\-. ]/g, "_").trim() || "export";

  try {
    return await generateXlsx(input, safeName);
  } catch (err) {
    console.error("[GenerateSpreadsheet] XLSX generation failed, falling back to CSV:", err);
    return generateCsvFallback(input, safeName);
  }
}

async function generateXlsx(
  input: GenerateSpreadsheetInput,
  safeName: string,
): Promise<AssetFileInfo> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "HEARST OS";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(input.title.slice(0, 31) || "Data");

  const headers = collectHeaders(input.rows);
  sheet.columns = headers.map((h) => ({
    header: h,
    key: h,
    width: Math.max(h.length + 4, 12),
  }));

  // Style header row
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, size: 11 };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFE8E8E8" },
  };

  for (const row of input.rows) {
    const values: Record<string, unknown> = {};
    for (const h of headers) {
      const v = row[h];
      values[h] = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : v;
    }
    sheet.addRow(values);
  }

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const fileName = `${safeName}.xlsx`;

  return saveAssetFile({
    tenantId: input.tenantId,
    runId: input.runId,
    assetId: input.assetId,
    fileName,
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    content: buffer,
  });
}

function generateCsvFallback(
  input: GenerateSpreadsheetInput,
  safeName: string,
): AssetFileInfo {
  const headers = collectHeaders(input.rows);
  const lines = [headers.join(",")];

  for (const row of input.rows) {
    const values = headers.map((h) => {
      const v = row[h];
      if (v === null || v === undefined) return "";
      const s = typeof v === "object" ? JSON.stringify(v) : String(v);
      return s.includes(",") || s.includes('"') || s.includes("\n")
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    });
    lines.push(values.join(","));
  }

  const fileName = `${safeName}.csv`;

  return saveAssetFile({
    tenantId: input.tenantId,
    runId: input.runId,
    assetId: input.assetId,
    fileName,
    mimeType: "text/csv",
    content: lines.join("\n"),
  });
}

function collectHeaders(rows: Record<string, unknown>[]): string[] {
  const set = new Set<string>();
  for (const row of rows) {
    for (const k of Object.keys(row)) set.add(k);
  }
  return Array.from(set);
}
