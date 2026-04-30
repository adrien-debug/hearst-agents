/**
 * Enregistrement des fonts embedded (Source Serif 4 + Inter) sur un
 * PDFDocument. Si l'embed échoue (fichier manquant en prod, perms FS), on bascule
 * proprement vers les built-in PDFKit (Times-* / Helvetica-*) pour ne jamais
 * casser la génération.
 */

import path from "node:path";
import fs from "node:fs";
import { FONTS } from "./pdf-tokens";

/** Résolu une seule fois — répertoire des TTF embarqués. */
const FONT_DIR = path.join(process.cwd(), "lib", "reports", "export", "fonts");

/**
 * État après tentative d'embed. Si `embedded === false`, les helpers de
 * rendu utiliseront les fonts PDFKit built-in via `setFont()` ci-dessous.
 */
export interface FontRegistrationResult {
  embedded: boolean;
  reason?: string;
}

interface FontEntry {
  alias: string;
  file: string;
}

const FONT_ENTRIES: FontEntry[] = [
  { alias: FONTS.serif, file: "SourceSerif4-Regular.ttf" },
  { alias: FONTS.serifBold, file: "SourceSerif4-Bold.ttf" },
  { alias: FONTS.serifItalic, file: "SourceSerif4-It.ttf" },
  { alias: FONTS.sans, file: "Inter-Regular.ttf" },
  { alias: FONTS.sansMedium, file: "Inter-Medium.ttf" },
  { alias: FONTS.sansSemiBold, file: "Inter-SemiBold.ttf" },
];

export function registerFonts(doc: PDFKit.PDFDocument): FontRegistrationResult {
  try {
    if (!fs.existsSync(FONT_DIR)) {
      return { embedded: false, reason: "font_dir_missing" };
    }
    for (const { alias, file } of FONT_ENTRIES) {
      const fullPath = path.join(FONT_DIR, file);
      if (!fs.existsSync(fullPath)) {
        return { embedded: false, reason: `missing:${file}` };
      }
      doc.registerFont(alias, fullPath);
    }
    return { embedded: true };
  } catch (err) {
    return {
      embedded: false,
      reason: err instanceof Error ? err.message : "unknown",
    };
  }
}

/**
 * Setter unique de font — gère le fallback transparent si embed a échoué.
 * Tous les helpers de rendu doivent passer par lui plutôt que `doc.font(...)`.
 */
export function setFont(
  doc: PDFKit.PDFDocument,
  family: "serif" | "serifBold" | "serifItalic" | "sans" | "sansMedium" | "sansSemiBold",
  embedded: boolean,
): void {
  if (embedded) {
    doc.font(FONTS[family]);
    return;
  }
  // Fallback PDFKit built-in.
  switch (family) {
    case "serif":
      doc.font(FONTS.fallbackSerif);
      return;
    case "serifBold":
      doc.font(FONTS.fallbackSerifBold);
      return;
    case "serifItalic":
      doc.font(FONTS.fallbackSerifItalic);
      return;
    case "sans":
      doc.font(FONTS.fallbackSans);
      return;
    case "sansMedium":
    case "sansSemiBold":
      doc.font(FONTS.fallbackSansBold);
      return;
  }
}
