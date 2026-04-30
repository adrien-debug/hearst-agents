/**
 * Pull-quote — citation italic centrée, encadrée par deux rules accent or.
 * Utilisé pour mettre en exergue une narration courte ou une citation.
 */

import { COLORS, FONT_SIZES, SPACE, RULES, PAGE } from "../pdf-tokens";
import { setFont } from "../pdf-fonts";

export interface QuoteInput {
  text: string;
  /** Auteur / source. */
  attribution?: string;
  embedded: boolean;
}

export function renderQuote(doc: PDFKit.PDFDocument, input: QuoteInput): void {
  const x = doc.x;
  const width = PAGE.width - PAGE.marginX * 2;
  const innerWidth = width * 0.75;
  const innerX = x + (width - innerWidth) / 2;

  doc.y += SPACE.s4;

  // Rule top
  doc.save();
  doc
    .lineWidth(RULES.thin)
    .strokeColor(COLORS.accent)
    .moveTo(innerX + innerWidth / 2 - 30, doc.y)
    .lineTo(innerX + innerWidth / 2 + 30, doc.y)
    .stroke();
  doc.restore();
  doc.y += SPACE.s4;

  // Quote
  setFont(doc, "serifItalic", input.embedded);
  doc
    .fontSize(FONT_SIZES.lead)
    .fillColor(COLORS.ink)
    .text(`« ${input.text} »`, innerX, doc.y, {
      width: innerWidth,
      align: "center",
      lineGap: 4,
    });

  doc.y += SPACE.s2;

  // Attribution
  if (input.attribution && input.attribution.trim().length > 0) {
    setFont(doc, "sansMedium", input.embedded);
    doc
      .fontSize(FONT_SIZES.eyebrow)
      .fillColor(COLORS.muted)
      .text(`— ${input.attribution.toUpperCase()}`, innerX, doc.y, {
        width: innerWidth,
        align: "center",
        characterSpacing: 1.4,
      });
    doc.y += SPACE.s2;
  }

  // Rule bottom
  doc.save();
  doc
    .lineWidth(RULES.thin)
    .strokeColor(COLORS.accent)
    .moveTo(innerX + innerWidth / 2 - 30, doc.y)
    .lineTo(innerX + innerWidth / 2 + 30, doc.y)
    .stroke();
  doc.restore();
  doc.y += SPACE.s6;
}
