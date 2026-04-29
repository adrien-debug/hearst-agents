/**
 * Export Excel — un onglet par bloc tabulaire, un onglet "Charts" pour les
 * blocs visuels (extraction data brute), un onglet "Meta" avec les métadonnées.
 *
 * Lib : exceljs (déjà en dependencies).
 */

import ExcelJS from "exceljs";
import type { RenderedBlock } from "@/lib/reports/engine/render-blocks";
import type { ExportInput, ExportResult } from "./types";
import { XLSX_CONTENT_TYPE } from "./types";

const META_SHEET = "Meta";
const CHARTS_SHEET = "Charts";

const TABULAR_TYPES = new Set([
  "table",
  "kpi",
  "bar",
  "funnel",
  "pareto",
  "cohort_triangle",
]);

function safeSheetName(input: string, used: Set<string>): string {
  // Excel : max 31 chars, pas de [ ] : * ? / \
  let cleaned = input.replace(/[\[\]:*?/\\]/g, "_").slice(0, 31).trim();
  if (!cleaned) cleaned = "Sheet";
  let candidate = cleaned;
  let i = 2;
  while (used.has(candidate)) {
    const suffix = `_${i}`;
    candidate = `${cleaned.slice(0, 31 - suffix.length)}${suffix}`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "report";
}

export async function exportXlsx(input: ExportInput): Promise<ExportResult> {
  const { payload, meta, narration, fileName } = input;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Hearst OS";
  workbook.created = new Date(payload.generatedAt);

  const usedNames = new Set<string>();

  // ── Meta sheet ────────────────────────────────────────
  const metaSheet = workbook.addWorksheet(safeSheetName(META_SHEET, usedNames));
  metaSheet.columns = [
    { header: "Champ", key: "k", width: 24 },
    { header: "Valeur", key: "v", width: 80 },
  ];
  metaSheet.addRows([
    { k: "Titre", v: meta.title },
    { k: "Domaine", v: meta.domain },
    { k: "Persona", v: meta.persona },
    { k: "Cadence", v: meta.cadence },
    { k: "Confidentialité", v: meta.confidentiality },
    { k: "Résumé", v: meta.summary ?? "" },
    { k: "Spec ID", v: payload.specId },
    { k: "Version", v: payload.version },
    { k: "Généré (UTC)", v: new Date(payload.generatedAt).toISOString() },
    { k: "Narration", v: narration ?? "" },
  ]);
  metaSheet.getRow(1).font = { bold: true };

  // ── Charts sheet (placeholders, on ajoute des entrées si non-tabulaires) ─
  const chartsSheet = workbook.addWorksheet(
    safeSheetName(CHARTS_SHEET, usedNames),
  );
  chartsSheet.columns = [
    { header: "Bloc ID", key: "id", width: 24 },
    { header: "Type", key: "type", width: 18 },
    { header: "Label", key: "label", width: 28 },
    { header: "Données brutes (JSON)", key: "raw", width: 80 },
  ];
  chartsSheet.getRow(1).font = { bold: true };

  // ── Un onglet par bloc tabulaire ──────────────────────
  for (const block of payload.blocks) {
    if (TABULAR_TYPES.has(block.type)) {
      writeTabularBlock(workbook, block, usedNames);
    } else {
      chartsSheet.addRow({
        id: block.id,
        type: block.type,
        label: block.label ?? "",
        raw: JSON.stringify({ data: block.data, props: block.props }),
      });
    }
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  const buffer = Buffer.from(arrayBuffer as ArrayBuffer);
  const safeBase = safeFileName(fileName ?? meta.title);

  return {
    buffer,
    contentType: XLSX_CONTENT_TYPE,
    fileName: `${safeBase}.xlsx`,
    size: buffer.length,
  };
}

// ── Helpers ─────────────────────────────────────────────────

function writeTabularBlock(
  workbook: ExcelJS.Workbook,
  block: RenderedBlock,
  usedNames: Set<string>,
): void {
  const sheetName = safeSheetName(
    block.label && block.label.trim().length > 0 ? block.label : block.id,
    usedNames,
  );
  const sheet = workbook.addWorksheet(sheetName);

  if (block.type === "kpi") {
    const data = block.data as { value: unknown; delta?: unknown; sparkline?: number[] | null };
    sheet.columns = [
      { header: "Champ", key: "k", width: 18 },
      { header: "Valeur", key: "v", width: 32 },
    ];
    sheet.addRow({ k: "value", v: data.value ?? null });
    if (data.delta !== undefined) sheet.addRow({ k: "delta", v: data.delta ?? null });
    if (Array.isArray(data.sparkline)) {
      sheet.addRow({ k: "sparkline", v: data.sparkline.join(",") });
    }
    sheet.getRow(1).font = { bold: true };
    return;
  }

  if (block.type === "cohort_triangle") {
    const props = block.props as {
      cohorts?: Array<{ label: string; values: number[] }>;
      periodPrefix?: string;
    };
    const cohorts = props.cohorts ?? [];
    const maxLen = cohorts.reduce((acc, c) => Math.max(acc, c.values.length), 0);
    const prefix = props.periodPrefix ?? "M";
    const headers = [
      { header: "Cohorte", key: "_label", width: 18 },
      ...Array.from({ length: maxLen }, (_, i) => ({
        header: `${prefix}${i}`,
        key: `${prefix}${i}`,
        width: 12,
      })),
    ];
    sheet.columns = headers;
    for (const c of cohorts) {
      const row: Record<string, unknown> = { _label: c.label };
      c.values.forEach((v, i) => {
        row[`${prefix}${i}`] = v;
      });
      sheet.addRow(row);
    }
    sheet.getRow(1).font = { bold: true };
    return;
  }

  // table / bar / funnel / pareto
  const rows = Array.isArray(block.data)
    ? (block.data as Array<Record<string, unknown>>)
    : [];
  if (rows.length === 0) {
    sheet.addRow(["(aucune ligne)"]);
    return;
  }
  const cols = Object.keys(rows[0]);
  sheet.columns = cols.map((c) => ({ header: c, key: c, width: 18 }));
  for (const r of rows) sheet.addRow(r);
  sheet.getRow(1).font = { bold: true };
}
