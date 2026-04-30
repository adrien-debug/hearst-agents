/**
 * Export PDF — rendu éditorial premium d'un RenderPayload via pdfkit.
 *
 * Refonte mai 2026 : passage du "terminal output" au "magazine print" inspiré
 * du PDF Art of Life Equine. Plus de pipe ASCII, plus de hex codes en dur, plus
 * de Helvetica-only. Architecture modulaire :
 *
 *   pdf.ts                ← orchestrateur (cover + sections + chrome + blocks)
 *   pdf-tokens.ts         ← couleurs / typo / spacing (mapped to globals.css)
 *   pdf-fonts.ts          ← embed Source Serif 4 + Inter, fallback Times/Helvetica
 *   pdf-cover.ts          ← page 1 éditoriale
 *   pdf-section.ts        ← header de section + chrome page (header/footer)
 *   pdf-blocks/kpi.ts     ← grand chiffre serif + label small caps
 *   pdf-blocks/prose.ts   ← lead italic + body justifié
 *   pdf-blocks/table.ts   ← vraie table (pas de pipe ASCII)
 *   pdf-blocks/chart.ts   ← bar/funnel/waterfall/bullet/sparkline minimalistes
 *   pdf-blocks/quote.ts   ← pull-quote italic centré
 *   pdf-blocks/cohort.ts  ← matrice avec cells colorées (intensité accent or)
 *
 * Pourquoi pdfkit (pas Playwright) ? Browser bundle ~300 Mo non dispo en prod
 * Vercel/Railway. pdfkit est déjà en deps, déterministe, 0 dépendance browser.
 *
 * Signature inchangée : `exportPdf(input): Promise<ExportResult>` — les
 * callers (api/reports/[id]/export, mission-job) ne bougent pas.
 */

import PDFDocument from "pdfkit";
import type { RenderedBlock } from "@/lib/reports/engine/render-blocks";
import type { ExportInput, ExportResult } from "./types";
import { PDF_CONTENT_TYPE } from "./types";
import {
  COLORS,
  FONT_SIZES,
  PAGE,
  SPACE,
  BRAND,
} from "./pdf-tokens";
import { registerFonts, setFont } from "./pdf-fonts";
import { renderCover } from "./pdf-cover";
import { renderPageChrome, renderSectionHeader } from "./pdf-section";
import { renderKpi } from "./pdf-blocks/kpi";
import { renderProse } from "./pdf-blocks/prose";
import { renderTable } from "./pdf-blocks/table";
import {
  renderBarChart,
  renderWaterfall,
  renderBullet,
  renderSparkline,
} from "./pdf-blocks/chart";
import { renderQuote } from "./pdf-blocks/quote";
import { renderCohort } from "./pdf-blocks/cohort";

function bufferFromDoc(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function safeFileName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-_]+/g, "_")
    .slice(0, 60) || "report";
}

/** Helpers pagination — track la section + numéro de page courants. */
interface ChromeState {
  pageNumber: number;
  currentSection: string;
}

export async function exportPdf(input: ExportInput): Promise<ExportResult> {
  const { payload, meta, narration, fileName } = input;

  const doc = new PDFDocument({
    size: PAGE.size,
    margins: {
      top: PAGE.marginY,
      bottom: PAGE.marginY,
      left: PAGE.marginX,
      right: PAGE.marginX,
    },
    autoFirstPage: false,
    info: {
      Title: meta.title,
      Subject: `Hearst OS — ${meta.persona} ${meta.cadence}`,
      Producer: "Hearst OS",
      Creator: BRAND.name,
    },
  });

  const bufferPromise = bufferFromDoc(doc);
  const fontResult = registerFonts(doc);
  const embedded = fontResult.embedded;

  const chrome: ChromeState = {
    pageNumber: 1,
    currentSection: "COVER",
  };

  // ── Page 1 : Cover éditoriale ─────────────────────────
  doc.addPage({
    size: PAGE.size,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  });
  renderCover(doc, {
    title: meta.title,
    subtitle: meta.summary || undefined,
    description: buildCoverDescription(meta, payload),
    confidentiality: meta.confidentiality,
    generatedAt: payload.generatedAt,
    persona: meta.persona,
    cadence: meta.cadence,
    embedded,
    dark: true,
  });

  // ── Page 2 : Manifesto / contexte (si narration) ──────
  if (narration && narration.trim().length > 0) {
    chrome.pageNumber = 2;
    chrome.currentSection = "MANIFESTO";
    addContentPage(doc, chrome, embedded);
    renderSectionHeader(doc, {
      eyebrow: "INTRODUCTION",
      title: "Manifeste",
      lead: "Synthèse narrative du rapport.",
      embedded,
    });
    renderProse(doc, { text: narration, embedded, withLead: true });
  }

  // ── Pages intérieures : 1 section / page ──────────────
  // Stratégie : on regroupe les KPI par row (col=1 → 4 par row) et chaque autre
  // primitive a sa propre section. On laisse pdfkit gérer le saut de page si
  // un block dépasse.
  const groups = groupBlocks(payload.blocks);
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    chrome.pageNumber += 1;
    chrome.currentSection = sectionTitleForGroup(group, i);
    addContentPage(doc, chrome, embedded);

    renderSectionHeader(doc, {
      eyebrow: `SECTION ${(i + 1).toString().padStart(2, "0")}`,
      title: chrome.currentSection,
      embedded,
    });

    if (group.kind === "kpi-row") {
      renderKpiRow(doc, group.blocks, embedded);
    } else {
      for (const block of group.blocks) {
        try {
          renderSingleBlock(doc, block, embedded);
        } catch (err) {
          renderBlockError(doc, block, err, embedded);
        }
        doc.y += SPACE.s4;
      }
    }
  }

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

// ── Helpers d'orchestration ─────────────────────────────

function buildCoverDescription(
  meta: ExportInput["meta"],
  payload: { blocks: RenderedBlock[] },
): string {
  const blockCount = payload.blocks.length;
  const parts = [
    `Rapport ${meta.domain} produit pour ${meta.persona} (cadence ${meta.cadence}).`,
    `${blockCount} ${blockCount > 1 ? "indicateurs analysés" : "indicateur analysé"}.`,
  ];
  return parts.join(" ");
}

function addContentPage(
  doc: PDFKit.PDFDocument,
  chrome: ChromeState,
  embedded: boolean,
): void {
  doc.addPage({
    size: PAGE.size,
    margins: {
      top: PAGE.marginY,
      bottom: PAGE.marginY,
      left: PAGE.marginX,
      right: PAGE.marginX,
    },
  });
  renderPageChrome(doc, {
    pageNumber: chrome.pageNumber,
    sectionTitle: chrome.currentSection,
    embedded,
  });
  // Reset cursor sous le header
  doc.x = PAGE.marginX;
  doc.y = PAGE.marginY + SPACE.s2;
}

interface BlockGroup {
  kind: "kpi-row" | "single";
  blocks: RenderedBlock[];
}

/**
 * Regroupe les KPI consécutifs sur une même row (col=1, jusqu'à 4 dans la
 * grille 4 colonnes du DS) en un seul groupe rendu en grille horizontale.
 * Chaque autre block forme son propre groupe (= sa propre section/page).
 */
function groupBlocks(blocks: RenderedBlock[]): BlockGroup[] {
  const groups: BlockGroup[] = [];
  let kpiBuffer: RenderedBlock[] = [];

  const flushKpi = () => {
    if (kpiBuffer.length > 0) {
      groups.push({ kind: "kpi-row", blocks: kpiBuffer });
      kpiBuffer = [];
    }
  };

  for (const b of blocks) {
    if (b.type === "kpi" && (b.layout?.col === 1 || b.layout?.col === 2)) {
      kpiBuffer.push(b);
      // Si on a 4 KPI accumulés on flush (une row complète).
      if (kpiBuffer.length >= 4) flushKpi();
    } else {
      flushKpi();
      groups.push({ kind: "single", blocks: [b] });
    }
  }
  flushKpi();

  return groups;
}

function sectionTitleForGroup(group: BlockGroup, idx: number): string {
  if (group.kind === "kpi-row") return "Indicateurs clés";
  const b = group.blocks[0];
  if (b?.label) return b.label;
  if (b?.type) return prettyType(b.type);
  return `Section ${idx + 1}`;
}

function prettyType(type: string): string {
  const m: Record<string, string> = {
    kpi: "Indicateur clé",
    bar: "Répartition",
    funnel: "Funnel",
    pareto: "Pareto",
    table: "Table",
    sparkline: "Tendance",
    waterfall: "Waterfall",
    cohort_triangle: "Cohorte",
    bullet: "Atteinte des cibles",
    heatmap: "Heatmap",
    sankey: "Flux",
    radar: "Radar",
    gantt: "Planning",
    calendar_heatmap: "Calendrier",
    treemap: "Treemap",
    network: "Graphe",
    box_violin: "Distribution",
    geo: "Carte",
    monte_carlo: "Simulation",
    control_chart: "Contrôle",
  };
  return m[type] ?? type;
}

// ── Rendu d'un block individuel ─────────────────────────

function renderKpiRow(
  doc: PDFKit.PDFDocument,
  blocks: RenderedBlock[],
  embedded: boolean,
): void {
  const totalWidth = PAGE.width - PAGE.marginX * 2;
  const gap = SPACE.s6;
  const colCount = blocks.length;
  const colWidth = (totalWidth - gap * (colCount - 1)) / colCount;
  const startY = doc.y;
  let maxConsumed = 0;

  blocks.forEach((b, i) => {
    const data = b.data as { value: unknown; delta?: unknown };
    const consumed = renderKpi(doc, {
      label: b.label ?? b.id,
      value: data?.value ?? null,
      delta: data?.delta,
      x: PAGE.marginX + i * (colWidth + gap),
      y: startY,
      width: colWidth,
      embedded,
    });
    if (consumed > maxConsumed) maxConsumed = consumed;
  });

  doc.x = PAGE.marginX;
  doc.y = startY + maxConsumed + SPACE.s8;
}

function renderSingleBlock(
  doc: PDFKit.PDFDocument,
  block: RenderedBlock,
  embedded: boolean,
): void {
  switch (block.type) {
    case "kpi": {
      const data = block.data as { value: unknown; delta?: unknown; sparkline?: number[] | null };
      const startY = doc.y;
      renderKpi(doc, {
        label: block.label ?? block.id,
        value: data?.value ?? null,
        delta: data?.delta,
        x: PAGE.marginX,
        y: startY,
        width: PAGE.width - PAGE.marginX * 2,
        embedded,
      });
      // Sparkline si dispo
      if (data?.sparkline && Array.isArray(data.sparkline) && data.sparkline.length > 1) {
        renderSparkline(doc, data.sparkline as number[], {
          x: PAGE.marginX,
          y: doc.y + SPACE.s4,
          width: PAGE.width - PAGE.marginX * 2,
          height: 40,
          embedded,
        });
        doc.y += 40 + SPACE.s4;
      }
      return;
    }
    case "table": {
      const rows = Array.isArray(block.data) ? (block.data as Array<Record<string, unknown>>) : [];
      renderTable(doc, { rows, embedded });
      return;
    }
    case "bar":
    case "funnel":
    case "pareto": {
      const rows = Array.isArray(block.data) ? (block.data as Array<Record<string, unknown>>) : [];
      const props = block.props ?? {};
      renderBarChart(doc, {
        rows,
        labelField: typeof props.labelField === "string" ? props.labelField : undefined,
        valueField: typeof props.valueField === "string" ? props.valueField : undefined,
        embedded,
      });
      return;
    }
    case "waterfall": {
      const props = block.props as {
        data?: Array<{ label: string; value: number; type: string }>;
        currency?: string;
      };
      renderWaterfall(doc, {
        data: props.data ?? [],
        currency: props.currency,
        embedded,
      });
      return;
    }
    case "bullet": {
      const props = block.props as {
        items?: Array<{ label: string; actual: number; target: number }>;
      };
      renderBullet(doc, { items: props.items ?? [], embedded });
      return;
    }
    case "cohort_triangle": {
      const props = block.props as {
        cohorts?: Array<{ label: string; values: number[] }>;
        asPercent?: boolean;
      };
      renderCohort(doc, {
        cohorts: props.cohorts ?? [],
        asPercent: props.asPercent,
        embedded,
      });
      return;
    }
    case "sparkline": {
      const data = Array.isArray(block.data) ? (block.data as Array<Record<string, unknown>>) : [];
      const props = block.props ?? {};
      const valueField =
        typeof props.valueField === "string"
          ? props.valueField
          : Object.keys(data[0] ?? {})[0] ?? "value";
      const values = data
        .map((r) => Number(r[valueField] ?? 0))
        .filter((v) => Number.isFinite(v));
      if (values.length > 1) {
        renderSparkline(doc, values, {
          x: PAGE.marginX,
          y: doc.y,
          width: PAGE.width - PAGE.marginX * 2,
          height: 60,
          embedded,
        });
        doc.y += 60 + SPACE.s4;
      } else {
        renderUnsupportedFallback(doc, block, embedded);
      }
      return;
    }
    default:
      renderUnsupportedFallback(doc, block, embedded);
      return;
  }
}

function renderUnsupportedFallback(
  doc: PDFKit.PDFDocument,
  block: RenderedBlock,
  embedded: boolean,
): void {
  // Pull-quote informant que ce type n'est pas rendu graphiquement en print.
  renderQuote(doc, {
    text: `Le bloc « ${prettyType(block.type)} » n'est pas rendu visuellement en print. Voir la version interactive du rapport.`,
    attribution: block.label ?? block.id,
    embedded,
  });
}

function renderBlockError(
  doc: PDFKit.PDFDocument,
  block: RenderedBlock,
  err: unknown,
  embedded: boolean,
): void {
  setFont(doc, "serifItalic", embedded);
  doc
    .fontSize(FONT_SIZES.small)
    .fillColor(COLORS.muted)
    .text(
      `Rendu indisponible (${prettyType(block.type)}) — ${
        err instanceof Error ? err.message : "erreur inconnue"
      }`,
      { lineGap: 2 },
    );
}
