/**
 * Vraie table éditoriale — colonnes alignées, lignes hairlines, header en
 * small caps, alternance de fonds très subtile.
 *
 * Plus de pipe ASCII — chaque cellule est positionnée à un x calculé.
 */

import { COLORS, FONT_SIZES, SPACE, PAGE, RULES } from "../pdf-tokens";
import { setFont } from "../pdf-fonts";

const MAX_ROWS = 30;
const MAX_COLS = 6;
const ROW_HEIGHT = 18;
const HEADER_HEIGHT = 22;

export interface TableInput {
  rows: Array<Record<string, unknown>>;
  /** Colonnes à afficher (ordre canonique). Si omis, dérivées de rows[0]. */
  columns?: string[];
  /** Labels d'en-tête (si on veut surcharger les noms de colonnes). */
  headerLabels?: Record<string, string>;
  embedded: boolean;
}

export function renderTable(doc: PDFKit.PDFDocument, input: TableInput): void {
  const { rows, embedded } = input;
  if (rows.length === 0) {
    setFont(doc, "serifItalic", embedded);
    doc
      .fontSize(FONT_SIZES.small)
      .fillColor(COLORS.muted)
      .text("Aucune ligne à afficher.", { lineGap: 2 });
    return;
  }

  const cols = (input.columns ?? Object.keys(rows[0])).slice(0, MAX_COLS);
  const visible = rows.slice(0, MAX_ROWS);

  const x = doc.x;
  const totalWidth = PAGE.width - PAGE.marginX * 2;
  const colWidth = totalWidth / cols.length;

  // ── Header row ───────────────────────────────────────
  const headerY = doc.y;
  setFont(doc, "sansSemiBold", embedded);
  doc.fontSize(FONT_SIZES.eyebrow).fillColor(COLORS.muted);
  cols.forEach((c, i) => {
    const label = (input.headerLabels?.[c] ?? c).toUpperCase();
    doc.text(label, x + i * colWidth, headerY, {
      width: colWidth - SPACE.s2,
      characterSpacing: 1.0,
      lineBreak: false,
    });
  });

  // Rule sous header
  const ruleY = headerY + HEADER_HEIGHT - SPACE.s2;
  doc.save();
  doc
    .lineWidth(RULES.thin)
    .strokeColor(COLORS.accent)
    .moveTo(x, ruleY)
    .lineTo(x + totalWidth, ruleY)
    .stroke();
  doc.restore();

  doc.y = headerY + HEADER_HEIGHT;

  // ── Body rows ────────────────────────────────────────
  setFont(doc, "sans", embedded);
  doc.fontSize(FONT_SIZES.small).fillColor(COLORS.ink);

  visible.forEach((row, rowIdx) => {
    const rowY = doc.y;

    // Page break si on dépasse
    if (rowY + ROW_HEIGHT > PAGE.height - PAGE.marginY - SPACE.s10) {
      doc.addPage();
      doc.y = PAGE.marginY;
      return;
    }

    // Fond alterné très subtil
    if (rowIdx % 2 === 1) {
      doc.save();
      doc
        .rect(x - 4, rowY - 2, totalWidth + 8, ROW_HEIGHT)
        .fill("#FAF8F4");
      doc.restore();
    }

    setFont(doc, "sans", embedded);
    doc.fontSize(FONT_SIZES.small).fillColor(COLORS.ink);
    cols.forEach((c, i) => {
      const v = row[c];
      const text = formatCell(v);
      const isNumeric = typeof v === "number";
      doc.text(text, x + i * colWidth, rowY, {
        width: colWidth - SPACE.s2,
        align: isNumeric ? "right" : "left",
        lineBreak: false,
        ellipsis: true,
      });
    });
    doc.y = rowY + ROW_HEIGHT;
  });

  if (rows.length > visible.length) {
    setFont(doc, "serifItalic", embedded);
    doc
      .fontSize(FONT_SIZES.small)
      .fillColor(COLORS.muted)
      .text(
        `… ${rows.length - visible.length} lignes additionnelles tronquées.`,
        x,
        doc.y + SPACE.s2,
      );
  }
}

function formatCell(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "number") {
    return v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  }
  if (typeof v === "boolean") return v ? "✓" : "—";
  const s = String(v);
  return s.length > 40 ? s.slice(0, 38) + "…" : s;
}
