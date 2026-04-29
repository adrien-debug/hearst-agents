/**
 * Export CSV — stratégie "zero-dep", pour les exports rapides ou les flows
 * automatisés qui ingèrent du CSV (Zapier, Make, scripts).
 *
 * Approche : on concatène un CSV par bloc tabulaire dans un seul fichier,
 * séparé par une section "# block:<id>" + ligne vide. Pour les blocks non
 * tabulaires (KPI, sankey, radar, etc.), on émet un summary line.
 *
 * Le CSV produit est UTF-8 with BOM pour rester ouvrable directement dans
 * Excel français (sinon les accents partent en biais). Caractères spéciaux
 * RFC 4180 (virgule, guillemet, retour ligne) sont quotés.
 */

import type { RenderPayload, RenderedBlock } from "@/lib/reports/engine/render-blocks";
import type { ExportInput, ExportResult } from "./types";

const CSV_CONTENT_TYPE = "text/csv; charset=utf-8";
const BOM = "﻿";

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = typeof value === "string" ? value : String(value);
  // RFC 4180 : entoure de "..." si la cellule contient ", " ou \n, et double les "
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function rowsToCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
  if (rows.length === 0) return "";
  const cols = Array.from(
    rows.reduce<Set<string>>((acc, r) => {
      Object.keys(r).forEach((k) => acc.add(k));
      return acc;
    }, new Set()),
  );
  const lines = [cols.join(",")];
  for (const row of rows) {
    lines.push(cols.map((c) => escapeCell(row[c])).join(","));
  }
  return lines.join("\n");
}

function blockToCsvSection(block: RenderedBlock): string {
  const header = `# block:${block.id} type=${block.type}${block.label ? ` label="${block.label.replace(/"/g, '""')}"` : ""}`;

  if (block.type === "kpi") {
    const data = block.data as { value: unknown; delta?: unknown; sparkline?: number[] | null };
    const rows = [
      { field: "value", value: data.value ?? null },
      { field: "delta", value: data.delta ?? null },
    ];
    if (Array.isArray(data.sparkline)) {
      rows.push({ field: "sparkline", value: data.sparkline.join(",") });
    }
    return [header, rowsToCsv(rows)].join("\n");
  }

  if (Array.isArray(block.data) && block.data.length > 0) {
    return [header, rowsToCsv(block.data as Array<Record<string, unknown>>)].join("\n");
  }

  // fallback : on dump props comme JSON dans une seule cellule
  return [
    header,
    "props",
    escapeCell(JSON.stringify(block.props ?? {})),
  ].join("\n");
}

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "report";
}

export async function exportCsv(input: ExportInput): Promise<ExportResult> {
  const { payload, meta, narration, fileName } = input;
  const sections: string[] = [];

  sections.push(`# meta`);
  sections.push(
    rowsToCsv([
      { field: "title", value: meta.title },
      { field: "domain", value: meta.domain },
      { field: "persona", value: meta.persona },
      { field: "cadence", value: meta.cadence },
      { field: "spec_id", value: payload.specId },
      { field: "version", value: payload.version },
      { field: "generated_at", value: new Date(payload.generatedAt).toISOString() },
      { field: "narration", value: narration ?? "" },
    ]),
  );

  for (const block of payload.blocks) {
    sections.push(blockToCsvSection(block));
  }

  const buffer = Buffer.from(BOM + sections.join("\n\n") + "\n", "utf8");
  const safeBase = safeFileName(fileName ?? meta.title);

  return {
    buffer,
    contentType: CSV_CONTENT_TYPE,
    fileName: `${safeBase}.csv`,
    size: buffer.length,
  };
}

/** Helper test-only : sérialise UN seul bloc en CSV (sans header meta). */
export function _renderBlockCsv(block: RenderedBlock): string {
  return blockToCsvSection(block);
}

/** Helper test-only : full report → string CSV (sans buffer/BOM). */
export function _renderPayloadCsv(payload: RenderPayload): string {
  return payload.blocks.map(blockToCsvSection).join("\n\n");
}
