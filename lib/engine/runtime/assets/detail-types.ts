/**
 * Asset Detail — canonical UI inspection model.
 *
 * Supports partial preview even when full file storage is not ready.
 * File-backed assets expose download metadata without leaking internal paths.
 */

export type AssetPreviewType =
  | "text"
  | "json"
  | "document"
  | "report"
  | "unknown";

export interface AssetFileDetail {
  hasFile: boolean;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
}

export interface AssetDetail {
  id: string;
  runId: string;
  tenantId?: string;
  workspaceId?: string;
  userId?: string;

  name: string;
  type: string;

  previewType: AssetPreviewType;
  content?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  json?: Record<string, any> | any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;

  file?: AssetFileDetail;

  createdAt?: number;
}
