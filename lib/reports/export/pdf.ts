/**
 * Export PDF — rendu déterministe d'un RenderPayload via pdfkit.
 *
 * Approche retenue : **Option B (pdfkit programmatique)**.
 *
 * Pourquoi pas Playwright (Option A) ?
 *   - Playwright est bien dans devDependencies (e2e tests) mais le browser
 *     bundle (~300 Mo) n'est PAS disponible en prod (Vercel/Railway/etc).
 *     Lancer un browser headless server-side dans une route Next demande
 *     un setup runtime spécifique (Lambda layer, container custom).
 *   - pdfkit est déjà en dependencies + déterministe + 0 dépendance browser.
 *   - On rend des blocs en text-only/tabulaire (KPI, table, funnel, bar,
 *     cohort_triangle), avec fallback "non rendu visuellement" pour les
 *     blocs purement graphiques (sparkline, sankey, radar, heatmap).
 *
 * Si une régression visuelle nous force vers Option A, on swap ici sans
 * toucher aux callers : la signature `exportPdf(input): Promise<Buffer>` reste.
 */

import PDFDocument from "pdfkit";
import type { RenderedBlock } from "@/lib/reports/engine/render-blocks";
import type { ExportInput, ExportResult } from "./types";
import { PDF_CONTENT_TYPE } from "./types";

const PAGE_MARGIN = 50;
const TITLE_SIZE = 20;
const SECTION_TITLE_SIZE = 14;
const BODY_SIZE = 10;
const SMALL_SIZE = 9;
const COLOR_TEXT = "#111111";
const COLOR_MUTED = "#666666";
const COLOR_ACCENT = "#1f6feb";
const MAX_TABLE_ROWS = 30;
const MAX_TABLE_COLS = 8;

function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function fmtDate(ts: number): string {
  return new Date(ts).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function safeFileName(s: string): string {
  return s.replace(/[^a-zA-Z0-9-_]+/g, "_").slice(0, 60) || "report";
}

export async function exportPdf(input: ExportInput): Promise<ExportResult> {
  const { payload, meta, narration, fileName } = input;

  const doc = new PDFDocument({
    size: "A4",
    margin: PAGE_MARGIN,
    info: {
      Title: meta.title,
      Subject: `Hearst OS — ${meta.persona} ${meta.cadence}`,
      Producer: "Hearst OS",
    },
  });

  const bufferPromise = bufferFromDoc(doc);

  // ── Header ─────────────────────────────────────────────
  doc.fillColor(COLOR_TEXT).fontSize(TITLE_SIZE).text(meta.title);
  doc
    .moveDown(0.2)
    .fillColor(COLOR_MUTED)
    .fontSize(SMALL_SIZE)
    .text(
      `${meta.domain} · persona: ${meta.persona} · cadence: ${meta.cadence}`,
    );
  doc.moveDown(0.1).fontSize(SMALL_SIZE).text(`Généré le ${fmtDate(payload.generatedAt)}`);

  if (meta.summary) {
    doc.moveDown(0.6).fillColor(COLOR_TEXT).fontSize(BODY_SIZE).text(meta.summary);
  }

  // ── Narration (intro) ─────────────────────────────────
  if (narration && narration.trim().length > 0) {
    doc.moveDown(0.8);
    doc.fillColor(COLOR_TEXT).fontSize(SECTION_TITLE_SIZE).text("Narration");
    doc.moveDown(0.2);
    doc.fillColor(COLOR_TEXT).fontSize(BODY_SIZE).text(narration, {
      align: "left",
      lineGap: 2,
    });
  }

  // ── Blocs ──────────────────────────────────────────────
  for (const block of payload.blocks) {
    doc.moveDown(0.8);
    renderBlockSection(doc, block);
  }

  // ── Footer ─────────────────────────────────────────────
  doc.moveDown(1.0).fillColor(COLOR_MUTED).fontSize(SMALL_SIZE).text(
    `report:${payload.specId} · v${payload.version}`,
    { align: "right" },
  );

  doc.end();
  const buffer = await bufferPromise;

  const safeBase = safeFileName(fileName ?? meta.title);
  return {
    buffer,
    contentType: PDF_CONTENT_TYPE,
    fileName: `${safeBase}.pdf`,
    size: buffer.length,
  };
}

// ── Helpers de rendu par type de bloc ─────────────────────

function renderBlockSection(
  doc: PDFKit.PDFDocument,
  block: RenderedBlock,
): void {
  const title = block.label ?? `${block.type} · ${block.id}`;
  doc.fillColor(COLOR_ACCENT).fontSize(SECTION_TITLE_SIZE).text(title);
  doc.moveDown(0.2);

  try {
    switch (block.type) {
      case "kpi":
        renderKpi(doc, block);
        return;
      case "table":
      case "bar":
      case "funnel":
      case "pareto":
        renderTable(doc, block);
        return;
      case "cohort_triangle":
        renderCohort(doc, block);
        return;
      case "waterfall":
        renderWaterfall(doc, block);
        return;
      case "bullet":
        renderBullet(doc, block);
        return;
      default:
        renderTextFallback(doc, block);
        return;
    }
  } catch (err) {
    doc.fillColor(COLOR_MUTED).fontSize(SMALL_SIZE).text(
      `(rendu indisponible — ${err instanceof Error ? err.message : "erreur inconnue"})`,
    );
  }
}

function renderKpi(doc: PDFKit.PDFDocument, block: RenderedBlock): void {
  const data = block.data as { value: unknown; delta?: unknown };
  const valueStr =
    data.value === null || data.value === undefined ? "—" : String(data.value);
  doc.fillColor(COLOR_TEXT).fontSize(TITLE_SIZE).text(valueStr);
  if (data.delta !== null && data.delta !== undefined) {
    doc.fillColor(COLOR_MUTED).fontSize(SMALL_SIZE).text(`Δ ${data.delta}`);
  }
}

function renderTable(doc: PDFKit.PDFDocument, block: RenderedBlock): void {
  const rows = Array.isArray(block.data)
    ? (block.data as Array<Record<string, unknown>>)
    : [];
  if (rows.length === 0) {
    doc.fillColor(COLOR_MUTED).fontSize(SMALL_SIZE).text("(aucune ligne)");
    return;
  }

  const cols = Object.keys(rows[0]).slice(0, MAX_TABLE_COLS);
  const visible = rows.slice(0, MAX_TABLE_ROWS);

  doc.fillColor(COLOR_TEXT).fontSize(SMALL_SIZE);
  doc.text(cols.join(" | "), { lineGap: 1 });
  doc.fillColor(COLOR_MUTED).text("─".repeat(60), { lineGap: 1 });
  doc.fillColor(COLOR_TEXT);
  for (const row of visible) {
    const line = cols
      .map((c) => {
        const v = row[c];
        if (v === null || v === undefined) return "—";
        const s = String(v);
        return s.length > 20 ? s.slice(0, 19) + "…" : s;
      })
      .join(" | ");
    doc.text(line, { lineGap: 1 });
  }
  if (rows.length > visible.length) {
    doc
      .fillColor(COLOR_MUTED)
      .text(`(… ${rows.length - visible.length} lignes additionnelles tronquées)`);
  }
}

function renderCohort(doc: PDFKit.PDFDocument, block: RenderedBlock): void {
  const props = block.props as {
    cohorts?: Array<{ label: string; values: number[] }>;
    asPercent?: boolean;
  };
  const cohorts = props.cohorts ?? [];
  if (cohorts.length === 0) {
    renderTextFallback(doc, block);
    return;
  }
  doc.fillColor(COLOR_TEXT).fontSize(SMALL_SIZE);
  for (const c of cohorts) {
    const formatted = c.values
      .map((v) => (props.asPercent ? `${(v * 100).toFixed(1)}%` : String(v)))
      .join("  ");
    doc.text(`${c.label}  ${formatted}`, { lineGap: 1 });
  }
}

function renderWaterfall(doc: PDFKit.PDFDocument, block: RenderedBlock): void {
  const props = block.props as {
    data?: Array<{ label: string; value: number; type: string }>;
    currency?: string;
  };
  const items = props.data ?? [];
  if (items.length === 0) {
    renderTextFallback(doc, block);
    return;
  }
  doc.fillColor(COLOR_TEXT).fontSize(SMALL_SIZE);
  const cur = props.currency ?? "EUR";
  for (const it of items) {
    doc.text(`${it.type.padEnd(6)}  ${it.label.padEnd(28)}  ${it.value} ${cur}`, {
      lineGap: 1,
    });
  }
}

function renderBullet(doc: PDFKit.PDFDocument, block: RenderedBlock): void {
  const props = block.props as {
    items?: Array<{ label: string; actual: number; target: number }>;
  };
  const items = props.items ?? [];
  if (items.length === 0) {
    renderTextFallback(doc, block);
    return;
  }
  doc.fillColor(COLOR_TEXT).fontSize(SMALL_SIZE);
  for (const it of items) {
    const ratio = it.target !== 0 ? (it.actual / it.target) * 100 : 0;
    doc.text(
      `${it.label.padEnd(30)}  actuel: ${it.actual}  cible: ${it.target}  (${ratio.toFixed(1)}%)`,
      { lineGap: 1 },
    );
  }
}

function renderTextFallback(
  doc: PDFKit.PDFDocument,
  block: RenderedBlock,
): void {
  doc
    .fillColor(COLOR_MUTED)
    .fontSize(SMALL_SIZE)
    .text(
      `Bloc ${block.type} — rendu graphique non disponible en PDF, voir la version interactive.`,
    );
  if (Array.isArray(block.data) && block.data.length > 0) {
    doc.text(`(${block.data.length} entrées)`);
  }
}
