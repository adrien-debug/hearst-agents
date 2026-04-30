/**
 * Tokens design system PDF — alignés sur app/globals.css mais adaptés au
 * contexte print (couleurs en hex pur, sans rgba/color-mix que pdfkit ne sait
 * pas parser).
 *
 * Référence visuelle : Art of Life Equine — magazine éditorial print premium.
 * Le PDF Hearst hérite de ce langage : background dark, ink off-white, accent
 * or champagne sobre. Le cykan turquoise du produit n'a pas sa place ici — il
 * crierait dans un livret print où l'accent doit murmurer.
 *
 * IMPORTANT — single source of truth :
 * - Pour l'UI (Tailwind / CSS), source = app/globals.css
 * - Pour le PDF (pdfkit), source = ce fichier (mais `--gold` est dérivé du
 *   token CSS éponyme dans globals.css — si Adrien change l'un, il met à jour
 *   l'autre. Linké en commentaire pour traçabilité.)
 */

/** Couleurs hex (pdfkit accepte hex 6 chars uniquement, pas alpha). */
export const COLORS = {
  /** Fond du document — pages restent blanches en print (pdfkit n'imprime pas
   * un fill page-wide par défaut). On garde l'option pour cover-only. */
  background: "#FFFFFF",
  /** Background dark pour la cover éditoriale (Art of Life Equine vibe). */
  backgroundDark: "#0A0A0A",
  /** Encre primaire body sur fond clair. */
  ink: "#1A1815",
  /** Encre primaire body sur fond dark (cover). */
  inkLight: "#F5F1E8",
  /** Accent éditorial — or champagne. Mappe `--gold` dans globals.css. */
  accent: "#C8A961",
  /** Accent secondaire (hover/lighter) pour rules ou surlignages. */
  accentSoft: "#D9BE82",
  /** Texte secondaire / metadata / petits caps eyebrow. */
  muted: "#8B8578",
  /** Texte tertiaire / faint. */
  faint: "#B5B0A6",
  /** Lignes / borders fines. */
  rule: "#D8D3C8",
  /** Ligne fine sur fond dark. */
  ruleDark: "#3A3631",
  /** Code couleur sémantique — sobre, pas saturé. */
  positive: "#5A8F5A",
  negative: "#C84A3A",
  warn: "#C89A3A",
} as const;

/** Typographie — fonts embedded depuis lib/reports/export/fonts/. */
export const FONTS = {
  /** Source Serif 4 — display / headlines / pull quotes. */
  serif: "Serif",
  serifBold: "SerifBold",
  serifItalic: "SerifItalic",
  /** Inter — body / metadata / tables. */
  sans: "Sans",
  sansMedium: "SansMedium",
  sansSemiBold: "SansSemiBold",
  /** Fallback PDFKit built-in si embed échoue. */
  fallbackSerif: "Times-Roman",
  fallbackSerifBold: "Times-Bold",
  fallbackSerifItalic: "Times-Italic",
  fallbackSans: "Helvetica",
  fallbackSansBold: "Helvetica-Bold",
} as const;

/** Tailles typographiques — échelle éditoriale. Unité : points (pt). */
export const FONT_SIZES = {
  cover: 56,
  h1: 32,
  h2: 22,
  h3: 16,
  lead: 14,
  body: 11,
  small: 9.5,
  eyebrow: 8.5,
  micro: 7.5,
} as const;

/** Spacing — baseline 4pt grid. Mappe directement aux `--space-N` du DS. */
export const SPACE = {
  px: 1,
  s1: 4,
  s2: 8,
  s3: 12,
  s4: 16,
  s5: 20,
  s6: 24,
  s8: 32,
  s10: 40,
  s12: 48,
  s14: 56,
  s16: 64,
  s20: 80,
  s24: 120,
  s32: 160,
} as const;

/** Géométrie page A4. Marges éditoriales généreuses (pas le défaut 50pt). */
export const PAGE = {
  size: "A4" as const,
  width: 595.28,
  height: 841.89,
  /** Marges intérieures pages — 64pt = ~22mm, plus aéré que les 50pt par défaut. */
  marginX: 64,
  marginY: 72,
  /** Marges cover — encore plus large pour respiration. */
  coverMarginX: 56,
  coverMarginY: 64,
} as const;

/** Lignes / borders. Largeurs en pt. */
export const RULES = {
  hairline: 0.4,
  thin: 0.6,
  regular: 1,
  bold: 2,
  /** Largeur ligne accent or sur cover. */
  accentWidth: 60,
} as const;

/** Radius (pdfkit supporte roundedRect). */
export const RADIUS = {
  none: 0,
  xs: 2,
  sm: 4,
  md: 8,
  lg: 12,
} as const;

/** Métadonnées brand. */
export const BRAND = {
  name: "HEARST OS",
  shortName: "HEARST",
  version: "v1.0",
  /** Texte cover bandeau confidentialité — varie selon `meta.confidentiality`. */
  confidentialityLabel: {
    internal: "CONFIDENTIEL — RAPPORT INTERNE",
    shared: "RAPPORT — DIFFUSION RESTREINTE",
  } as const,
} as const;
