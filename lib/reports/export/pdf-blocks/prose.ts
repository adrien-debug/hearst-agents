/**
 * Bloc prose / narration — texte courant éditorial.
 *
 * Premier paragraphe en lead (serif italic accent or, plus grand) puis
 * le reste en body sans-serif justifié. Convention magazine éditorial.
 */

import { COLORS, FONT_SIZES, SPACE, PAGE } from "../pdf-tokens";
import { setFont } from "../pdf-fonts";

export interface ProseInput {
  text: string;
  embedded: boolean;
  /** Si true, premier paragraphe rendu en lead italic. */
  withLead?: boolean;
}

export function renderProse(doc: PDFKit.PDFDocument, input: ProseInput): void {
  const x = doc.x;
  const width = PAGE.width - PAGE.marginX * 2;
  const paragraphs = input.text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  if (paragraphs.length === 0) return;

  let bodyParas = paragraphs;
  if (input.withLead && paragraphs.length > 0) {
    // Lead = premier paragraphe.
    setFont(doc, "serifItalic", input.embedded);
    doc
      .fontSize(FONT_SIZES.lead)
      .fillColor(COLORS.accent)
      .text(paragraphs[0], x, doc.y, {
        width,
        lineGap: 4,
        align: "left",
      });
    doc.y += SPACE.s4;
    bodyParas = paragraphs.slice(1);
  }

  setFont(doc, "sans", input.embedded);
  doc.fontSize(FONT_SIZES.body).fillColor(COLORS.ink);
  for (const para of bodyParas) {
    doc.text(para, x, doc.y, {
      width,
      lineGap: 3,
      align: "justify",
      paragraphGap: SPACE.s3,
    });
  }
}
