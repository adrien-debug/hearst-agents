/**
 * Cover page éditoriale — page 1 du PDF.
 *
 * Layout (inspiré Art of Life Equine) :
 *   ┌─────────────────────────────────────┐
 *   │                                     │
 *   │  ───────  (rule accent or 60pt)     │
 *   │                                     │
 *   │  CONFIDENTIEL — RAPPORT INTERNE     │  ← eyebrow caps
 *   │                                     │
 *   │  Founder Cockpit                    │  ← H1 serif 56pt
 *   │                                     │
 *   │  Snapshot mensuel                   │  ← italic accent or 14pt
 *   │                                     │
 *   │  Vue d'ensemble cross-app pour      │  ← body sans-serif 11pt
 *   │  fondateur — MRR, pipeline ouvert,  │
 *   │  backlog email, semaine à venir.    │
 *   │                                     │
 *   │                                     │
 *   │                                     │
 *   │  HEARST OS · 01 — COVER         V1.0│  ← footer
 *   └─────────────────────────────────────┘
 */

import { COLORS, FONT_SIZES, PAGE, RULES, BRAND, SPACE } from "./pdf-tokens";
import { setFont } from "./pdf-fonts";

export interface CoverInput {
  title: string;
  /** Sous-titre court (italic accent or). */
  subtitle?: string;
  /** Description body sous le sous-titre. */
  description?: string;
  /** Tag confidentialité affiché en eyebrow. */
  confidentiality?: "internal" | "shared";
  /** Date de génération (epoch ms). */
  generatedAt: number;
  /** Persona (affiché en footer info). */
  persona?: string;
  /** Cadence (affiché en footer info). */
  cadence?: string;
  /** Version document. */
  version?: string;
  /** Si true, fond sombre éditorial (vs fond clair par défaut). */
  dark?: boolean;
  embedded: boolean;
}

function fmtDateEditorial(ts: number, locale = "fr-FR"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "long",
      year: "numeric",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toISOString().slice(0, 10);
  }
}

export function renderCover(doc: PDFKit.PDFDocument, input: CoverInput): void {
  const dark = input.dark === true;
  const ink = dark ? COLORS.inkLight : COLORS.ink;
  const eyebrowColor = dark ? COLORS.faint : COLORS.muted;
  const ruleColor = dark ? COLORS.ruleDark : COLORS.rule;

  // Fond dark si demandé (peint un rect plein page).
  if (dark) {
    doc.save();
    doc.rect(0, 0, PAGE.width, PAGE.height).fill(COLORS.backgroundDark);
    doc.restore();
  }

  const x = PAGE.coverMarginX;
  // Position verticale initiale — on commence à ~30% de la hauteur pour
  // laisser respirer le haut.
  let y = PAGE.coverMarginY + SPACE.s12;

  // ── Rule accent or ─────────────────────────────────────
  doc.save();
  doc
    .lineWidth(RULES.bold)
    .strokeColor(COLORS.accent)
    .moveTo(x, y)
    .lineTo(x + RULES.accentWidth, y)
    .stroke();
  doc.restore();
  y += SPACE.s8;

  // ── Eyebrow caps ───────────────────────────────────────
  const eyebrowText =
    BRAND.confidentialityLabel[input.confidentiality ?? "internal"];
  setFont(doc, "sansMedium", input.embedded);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(eyebrowColor)
    .text(eyebrowText, x, y, {
      characterSpacing: 1.2,
      width: PAGE.width - PAGE.coverMarginX * 2,
    });
  y = doc.y + SPACE.s10;

  // ── Titre H1 serif ─────────────────────────────────────
  setFont(doc, "serifBold", input.embedded);
  doc
    .fontSize(FONT_SIZES.cover)
    .fillColor(ink)
    .text(input.title, x, y, {
      width: PAGE.width - PAGE.coverMarginX * 2,
      lineGap: -8,
    });
  y = doc.y + SPACE.s4;

  // ── Sous-titre italic accent or ────────────────────────
  if (input.subtitle && input.subtitle.trim().length > 0) {
    setFont(doc, "serifItalic", input.embedded);
    doc
      .fontSize(FONT_SIZES.lead)
      .fillColor(COLORS.accent)
      .text(input.subtitle, x, y, {
        width: PAGE.width - PAGE.coverMarginX * 2,
        lineGap: 2,
      });
    y = doc.y + SPACE.s5;
  }

  // ── Description body ───────────────────────────────────
  if (input.description && input.description.trim().length > 0) {
    setFont(doc, "sans", input.embedded);
    doc
      .fontSize(FONT_SIZES.body)
      .fillColor(ink)
      .text(input.description, x, y, {
        width: (PAGE.width - PAGE.coverMarginX * 2) * 0.75,
        lineGap: 4,
        align: "left",
      });
    y = doc.y + SPACE.s6;
  }

  // ── Bloc métadonnées (date · persona · cadence) ────────
  const metaParts = [
    fmtDateEditorial(input.generatedAt),
    input.persona ? `Persona ${input.persona}` : null,
    input.cadence ? `Cadence ${input.cadence}` : null,
  ].filter((s): s is string => s !== null);

  // Position bas de page — réserve ~120pt pour métadonnées + footer.
  const bottomBlockY = PAGE.height - PAGE.coverMarginY - SPACE.s24;

  // Petite rule au-dessus des metas
  doc.save();
  doc
    .lineWidth(RULES.hairline)
    .strokeColor(ruleColor)
    .moveTo(x, bottomBlockY)
    .lineTo(PAGE.width - PAGE.coverMarginX, bottomBlockY)
    .stroke();
  doc.restore();

  setFont(doc, "sansMedium", input.embedded);
  doc
    .fontSize(FONT_SIZES.small)
    .fillColor(eyebrowColor)
    .text(metaParts.join("   ·   "), x, bottomBlockY + SPACE.s3, {
      characterSpacing: 0.4,
      width: PAGE.width - PAGE.coverMarginX * 2,
    });

  // ── Footer cover (au pied de page) ─────────────────────
  const footerY = PAGE.height - PAGE.coverMarginY;
  setFont(doc, "sansSemiBold", input.embedded);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(eyebrowColor)
    .text(BRAND.name, x, footerY, {
      characterSpacing: 1.5,
    });

  // Pagination cover : "01 — COVER"
  setFont(doc, "sans", input.embedded);
  const pageLabel = "01 — COVER";
  const pageLabelWidth = doc.widthOfString(pageLabel);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(eyebrowColor)
    .text(
      pageLabel,
      (PAGE.width - pageLabelWidth) / 2,
      footerY,
      { lineBreak: false },
    );

  // Version
  const version = input.version ?? BRAND.version;
  const versionWidth = doc.widthOfString(version);
  doc
    .fontSize(FONT_SIZES.eyebrow)
    .fillColor(eyebrowColor)
    .text(
      version,
      PAGE.width - PAGE.coverMarginX - versionWidth,
      footerY,
      { lineBreak: false },
    );
}
