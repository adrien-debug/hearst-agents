/**
 * Header de section éditorial pour les pages intérieures.
 *
 * Structure :
 *   ───── (rule accent or 40pt)
 *   EYEBROW SMALL CAPS
 *   Titre serif H2
 *
 * Plus le helper `renderPageChrome()` qui dessine header (brand) + footer
 * (pagination "NN · TITRE" + version) sur les pages intérieures.
 */

import {
  COLORS,
  FONT_SIZES,
  PAGE,
  RULES,
  BRAND,
  SPACE,
} from "./pdf-tokens";
import { setFont } from "./pdf-fonts";

export interface SectionHeaderInput {
  /** Petit eyebrow caps au-dessus du titre. Ex. "SECTION 02 — REVENUS". */
  eyebrow?: string;
  /** Titre H2 serif. */
  title: string;
  /** Sous-titre lead optionnel (italic accent). */
  lead?: string;
  embedded: boolean;
}

export function renderSectionHeader(
  doc: PDFKit.PDFDocument,
  input: SectionHeaderInput,
): void {
  const x = doc.x;
  const startY = doc.y;

  // Rule accent or
  doc.save();
  doc
    .lineWidth(RULES.regular)
    .strokeColor(COLORS.accent)
    .moveTo(x, startY)
    .lineTo(x + 40, startY)
    .stroke();
  doc.restore();

  doc.y = startY + SPACE.s4;

  // Eyebrow caps
  if (input.eyebrow && input.eyebrow.trim().length > 0) {
    setFont(doc, "sansMedium", input.embedded);
    doc
      .fontSize(FONT_SIZES.eyebrow)
      .fillColor(COLORS.muted)
      .text(input.eyebrow, x, doc.y, {
        characterSpacing: 1.4,
      });
    doc.y += SPACE.s2;
  }

  // Titre H2 serif
  setFont(doc, "serifBold", input.embedded);
  doc
    .fontSize(FONT_SIZES.h2)
    .fillColor(COLORS.ink)
    .text(input.title, x, doc.y, {
      lineGap: -2,
    });
  doc.y += SPACE.s2;

  // Lead optionnel
  if (input.lead && input.lead.trim().length > 0) {
    setFont(doc, "serifItalic", input.embedded);
    doc
      .fontSize(FONT_SIZES.lead)
      .fillColor(COLORS.accent)
      .text(input.lead, x, doc.y, {
        width: PAGE.width - PAGE.marginX * 2,
        lineGap: 2,
      });
    doc.y += SPACE.s4;
  } else {
    doc.y += SPACE.s2;
  }
}

export interface PageChromeInput {
  /** Numéro de page actuel (1-indexed, doit inclure la cover). */
  pageNumber: number;
  /** Titre de la section affichée sur cette page (footer). */
  sectionTitle: string;
  /** Version document (par défaut BRAND.version). */
  version?: string;
  embedded: boolean;
}

/**
 * Rendre header + footer brand sur une page intérieure.
 * À appeler à chaque `addPage()` (ou au début).
 */
export function renderPageChrome(
  doc: PDFKit.PDFDocument,
  input: PageChromeInput,
): void {
  const headerY = SPACE.s8;
  const footerY = PAGE.height - SPACE.s8;
  const xLeft = PAGE.marginX;
  const xRight = PAGE.width - PAGE.marginX;

  // ── Header ───────────────────────────────────────────
  setFont(doc, "sansSemiBold", input.embedded);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(COLORS.muted)
    .text(BRAND.shortName, xLeft, headerY, {
      characterSpacing: 1.8,
      lineBreak: false,
    });

  // Rule fine sous le header
  const ruleY = headerY + SPACE.s4;
  doc.save();
  doc
    .lineWidth(RULES.hairline)
    .strokeColor(COLORS.rule)
    .moveTo(xLeft, ruleY)
    .lineTo(xRight, ruleY)
    .stroke();
  doc.restore();

  // ── Footer ───────────────────────────────────────────
  // Rule fine au-dessus du footer
  const footerRuleY = footerY - SPACE.s2;
  doc.save();
  doc
    .lineWidth(RULES.hairline)
    .strokeColor(COLORS.rule)
    .moveTo(xLeft, footerRuleY)
    .lineTo(xRight, footerRuleY)
    .stroke();
  doc.restore();

  setFont(doc, "sans", input.embedded);
  const pageLabel = formatPageLabel(input.pageNumber, input.sectionTitle);
  const version = input.version ?? BRAND.version;

  // Brand gauche
  setFont(doc, "sansSemiBold", input.embedded);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(COLORS.muted)
    .text(BRAND.name, xLeft, footerY, {
      characterSpacing: 1.5,
      lineBreak: false,
    });

  // Pagination centre
  setFont(doc, "sans", input.embedded);
  const labelWidth = doc.widthOfString(pageLabel);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(COLORS.muted)
    .text(
      pageLabel,
      (PAGE.width - labelWidth) / 2,
      footerY,
      { lineBreak: false },
    );

  // Version droite
  const versionWidth = doc.widthOfString(version);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(COLORS.muted)
    .text(
      version,
      xRight - versionWidth,
      footerY,
      { lineBreak: false },
    );
}

function formatPageLabel(n: number, title: string): string {
  const num = n.toString().padStart(2, "0");
  // Préserve accents et caractères latins étendus (À-ÖØ-öø-ÿ).
  const cleaned = title
    .toUpperCase()
    .replace(/[^A-ZÀ-ÖØ-öø-ÿ0-9 \-—]+/giu, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
  return cleaned ? `${num} — ${cleaned}` : num;
}
