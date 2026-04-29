/**
 * Asset types — Lightweight deliverable outputs (files, exports).
 *
 * Distinct from Artifacts (structured content with sections/sources).
 * Assets represent downloadable file-like outputs: PDFs, spreadsheets, etc.
 */

export type AssetType =
  | "pdf"
  | "excel"
  | "doc"
  | "json"
  | "csv"
  | "report"
  | "text";

export type AssetStorageKind = "inline" | "file";

export interface AssetFileInfo {
  storageKind: AssetStorageKind;
  fileName: string;
  mimeType: string;
  filePath: string;
  sizeBytes: number;
}

export interface RuntimeAsset {
  id: string;
  type: AssetType;
  name: string;
  run_id: string;
  tenantId: string;
  workspaceId: string;
  /** UUID utilisateur — propagé vers provenance.userId à la persistance.
   * Optionnel pour rétro-compat, mais doit être fourni par tout call site
   * post-cleanup user_identity. Sans userId, l'asset devient orphelin
   * (RLS-invisible quand fallback `OR IS NULL` retiré). */
  userId?: string;
  created_at: number;
  url?: string;
  metadata?: Record<string, unknown>;
  file?: AssetFileInfo;
}

/** @deprecated Use RuntimeAsset instead */
export type Asset = RuntimeAsset;
