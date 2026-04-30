/**
 * KPI block — rendu éditorial : grand chiffre serif + label small caps + delta.
 *
 * Layout :
 *   ┌─────────────────────┐
 *   │ MRR                 │  ← label small caps
 *   │ €12,345             │  ← chiffre serif H1
 *   │ ↑ 12,4% vs M-1      │  ← delta italique muted
 *   └─────────────────────┘
 *
 * Si plusieurs KPI sont dans la même row, l'orchestrateur (pdf.ts) les
 * dispose en colonnes. Ici on rend juste un KPI dans la box donnée.
 */

import { COLORS, FONT_SIZES, SPACE } from "../pdf-tokens";
import { setFont } from "../pdf-fonts";

export interface KpiBoxInput {
  label: string;
  value: unknown;
  delta?: unknown;
  /** Box rect dans laquelle dessiner. */
  x: number;
  y: number;
  width: number;
  embedded: boolean;
}

/**
 * Retourne la hauteur consommée par le rendu (pour que l'orchestrateur sache
 * où placer le block suivant).
 */
export function renderKpi(doc: PDFKit.PDFDocument, input: KpiBoxInput): number {
  const { x, y, width, embedded } = input;

  // Rule fine au-dessus du label
  doc.save();
  doc
    .lineWidth(0.6)
    .strokeColor(COLORS.accent)
    .moveTo(x, y)
    .lineTo(x + 24, y)
    .stroke();
  doc.restore();

  let cursorY = y + SPACE.s2;

  // Label small caps
  setFont(doc, "sansMedium", embedded);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(COLORS.muted)
    .text(input.label.toUpperCase(), x, cursorY, {
      width,
      characterSpacing: 1.4,
    });
  cursorY = doc.y + SPACE.s2;

  // Chiffre serif large
  const valueStr = formatKpiValue(input.value);
  setFont(doc, "serifBold", embedded);
  doc
    .fontSize(FONT_SIZES.h1)
    .fillColor(COLORS.ink)
    .text(valueStr, x, cursorY, {
      width,
      lineGap: -2,
    });
  cursorY = doc.y + SPACE.s1;

  // Delta italique
  if (input.delta !== null && input.delta !== undefined) {
    const { text: deltaText, color } = formatDelta(input.delta);
    setFont(doc, "serifItalic", embedded);
    doc
      .fontSize(FONT_SIZES.small)
      .fillColor(color)
      .text(deltaText, x, cursorY, { width });
    cursorY = doc.y;
  }

  return cursorY - y;
}

function formatKpiValue(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    // Formatage court : milliers/millions selon magnitude.
    if (Math.abs(v) >= 1_000_000) {
      return `${(v / 1_000_000).toFixed(1)}M`;
    }
    if (Math.abs(v) >= 10_000) {
      return `${Math.round(v / 1000)}k`;
    }
    return v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
  }
  return String(v);
}

function formatDelta(v: unknown): { text: string; color: string } {
  if (typeof v === "number") {
    const sign = v > 0 ? "↑" : v < 0 ? "↓" : "·";
    const color =
      v > 0 ? COLORS.positive : v < 0 ? COLORS.negative : COLORS.muted;
    return {
      text: `${sign} ${Math.abs(v).toFixed(1)}%`,
      color,
    };
  }
  return { text: `Δ ${String(v)}`, color: COLORS.muted };
}
