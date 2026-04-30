/**
 * Cohort triangle — vraie matrice avec cellules colorées (intensité accent or
 * proportionnelle à la valeur). Plus de "─".repeat(60) terminal output.
 *
 * Layout :
 *   ┌──────┬──────┬──────┬──────┐
 *   │COHORT│  M0  │  M1  │  M2  │
 *   ├──────┼──────┼──────┼──────┤
 *   │ 2024-01│ 100% │ 80%  │ 65%  │
 *   │ 2024-02│ 100% │ 75%  │      │
 *   └──────┴──────┴──────┴──────┘
 */

import { COLORS, FONT_SIZES, SPACE, RULES, PAGE } from "../pdf-tokens";
import { setFont } from "../pdf-fonts";

export interface CohortInput {
  cohorts: Array<{ label: string; values: number[] }>;
  asPercent?: boolean;
  embedded: boolean;
}

export function renderCohort(doc: PDFKit.PDFDocument, input: CohortInput): void {
  if (input.cohorts.length === 0) return;

  const x = doc.x;
  const width = PAGE.width - PAGE.marginX * 2;
  const labelW = 80;
  const maxCols = Math.max(...input.cohorts.map((c) => c.values.length));
  const cellW = (width - labelW) / Math.max(maxCols, 1);
  const cellH = 22;

  // Trouve max pour intensité couleur
  const allValues = input.cohorts.flatMap((c) => c.values);
  const max = Math.max(...allValues, 0.0001);

  // Header row
  setFont(doc, "sansSemiBold", input.embedded);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(COLORS.muted);

  const headerY = doc.y;
  doc.text("COHORTE", x, headerY + 6, {
    width: labelW,
    characterSpacing: 1.2,
    lineBreak: false,
  });
  for (let i = 0; i < maxCols; i++) {
    doc.text(`P${i}`, x + labelW + i * cellW, headerY + 6, {
      width: cellW,
      align: "center",
      characterSpacing: 1.2,
      lineBreak: false,
    });
  }
  doc.y = headerY + cellH;

  // Rule sous header
  doc.save();
  doc
    .lineWidth(RULES.thin)
    .strokeColor(COLORS.accent)
    .moveTo(x, doc.y)
    .lineTo(x + width, doc.y)
    .stroke();
  doc.restore();
  doc.y += SPACE.s1;

  // Body
  setFont(doc, "sans", input.embedded);
  doc.fontSize(FONT_SIZES.small);

  for (const c of input.cohorts) {
    const rowY = doc.y;

    // Label
    doc
      .fillColor(COLORS.ink)
      .text(c.label, x, rowY + 6, {
        width: labelW - SPACE.s1,
        lineBreak: false,
        ellipsis: true,
      });

    // Cells
    for (let i = 0; i < maxCols; i++) {
      const v = c.values[i];
      const cellX = x + labelW + i * cellW;
      if (v === undefined || v === null) {
        // Cell vide
        continue;
      }
      const intensity = Math.min(Math.max(v / max, 0), 1);
      const opacity = 0.08 + intensity * 0.32;
      // Fond
      doc.save();
      doc.fillOpacity(opacity).rect(cellX + 1, rowY + 1, cellW - 2, cellH - 2).fill(COLORS.accent);
      doc.restore();

      const text = input.asPercent ? `${(v * 100).toFixed(1)}%` : String(v);
      doc
        .fillColor(COLORS.ink)
        .text(text, cellX, rowY + 6, {
          width: cellW,
          align: "center",
          lineBreak: false,
        });
    }
    doc.y = rowY + cellH;
  }
}
