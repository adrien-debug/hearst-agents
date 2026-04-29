/**
 * Types partagés des modules export (PDF / XLSX).
 */

import type { ReportMeta } from "@/lib/reports/spec/schema";
import type { RenderPayload } from "@/lib/reports/engine/render-blocks";

export interface ExportInput {
  /** RenderPayload produit par runReport. */
  payload: RenderPayload;
  /** Métadonnées du report (titre, persona, cadence…). */
  meta: ReportMeta;
  /** Narration optionnelle (insérée dans le PDF en intro / dans la feuille Meta). */
  narration?: string | null;
  /** Nom de fichier suggéré (sans extension). */
  fileName?: string;
}

export interface ExportResult {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  size: number;
}

export const PDF_CONTENT_TYPE = "application/pdf";
export const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** Storage prefix pour les exports (clé : `<prefix>/<assetId>/<timestamp>.<ext>`). */
export const EXPORT_STORAGE_PREFIX = "report-exports";
