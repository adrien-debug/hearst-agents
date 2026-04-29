/**
 * Options communes aux exporteurs (PDF / Excel / CSV).
 *
 * Validation Zod centralisée pour garantir un contrat stable côté API.
 */

import { z } from "zod";

export const exportFormatSchema = z.enum(["pdf", "xlsx", "csv"]);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const exportOptionsSchema = z.object({
  /** Titre affiché sur la première page / dans les métadonnées du fichier. */
  title: z.string().min(1).max(200).default("Report"),
  /** Sous-titre / résumé court. */
  summary: z.string().max(2000).optional(),
  /** Narration (si présente, ajoutée en intro de la page 1). */
  narration: z.string().max(20_000).optional(),
  /** Locale pour le formatage des dates et nombres. */
  locale: z.string().min(2).max(10).default("fr-FR"),
  /** Devise par défaut pour les blocks "currency" sans devise explicite. */
  currency: z.string().min(1).max(8).default("EUR"),
  /** Footer custom — sinon "Généré par Hearst OS — {date}". */
  footer: z.string().max(200).optional(),
  /** Nom de fichier sans extension. Sanitizé (ASCII safe). */
  fileName: z.string().min(1).max(120).default("report"),
});
export type ExportOptions = z.infer<typeof exportOptionsSchema>;

/** Sanitize un nom de fichier ASCII safe pour Content-Disposition. */
export function sanitizeFileName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120) || "report";
}
