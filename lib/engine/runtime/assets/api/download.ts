/**
 * Asset Download API — Architecture Finale
 *
 * Handles signed URL generation for secure file downloads.
 * Path: lib/engine/runtime/assets/api/download.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "../storage/types";

export interface DownloadUrlRequest {
  assetId: string;
  fileId?: string;
  /** User requesting the download */
  userId: string;
  /** Optional tenant scope */
  tenantId?: string;
  /** URL expiration in seconds (default: 3600 = 1 hour) */
  expiresInSeconds?: number;
  /** Force download as attachment vs inline */
  downloadAsAttachment?: boolean;
  /** Custom filename for the download */
  customFilename?: string;
}

export interface DownloadUrlResponse {
  url: string;
  expiresAt: string;
  filename: string;
  mimeType: string;
  size: number;
  method: "GET" | "POST";
}

export interface BatchDownloadRequest {
  assetIds: string[];
  userId: string;
  tenantId?: string;
  expiresInSeconds?: number;
}

export interface BatchDownloadResponse {
  urls: Array<{
    assetId: string;
    url: string;
    filename: string;
    expiresAt: string;
  }>;
  expiresAt: string;
  totalSize: number;
}

/**
 * Generate a signed download URL for an asset
 */
export async function generateDownloadUrl(
  db: SupabaseClient,
  storage: StorageProvider,
  request: DownloadUrlRequest
): Promise<DownloadUrlResponse> {
  // 1. Verify asset exists and user has access
  const asset = await verifyAssetAccess(db, request.assetId, request.userId, request.tenantId);

  if (!asset) {
    throw new DownloadError("Asset not found or access denied", 404);
  }

  if (!asset.storageKey) {
    throw new DownloadError("Asset has no associated file", 400);
  }

  // 2. Determine filename
  const filename = request.customFilename || asset.filename || `${asset.id}.bin`;

  // 3. Generate signed URL
  const expiresIn = request.expiresInSeconds || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  let signedUrl: string;
  try {
    // Use storage provider's signed URL capability
    signedUrl = await storage.getSignedUrl(
      asset.storageKey,
      "read",
      {
        expiresInSeconds: expiresIn,
        responseContentDisposition: request.downloadAsAttachment
          ? `attachment; filename="${encodeURIComponent(filename)}"`
          : `inline; filename="${encodeURIComponent(filename)}"`,
      }
    );

    if (!signedUrl) {
      throw new DownloadError("Storage provider did not return signed URL", 500);
    }
  } catch (err) {
    console.error("[DownloadAPI] Failed to generate signed URL:", err);
    throw new DownloadError(
      `Failed to generate download URL: ${err instanceof Error ? err.message : "Unknown error"}`,
      500
    );
  }

  // 4. Log access (async, don't block)
  logDownloadAccess(db, request, asset).catch((err) => {
    console.error("[DownloadAPI] Failed to log access:", err);
  });

  return {
    url: signedUrl,
    expiresAt: expiresAt.toISOString(),
    filename,
    mimeType: asset.mimeType || "application/octet-stream",
    size: asset.size || 0,
    method: "GET",
  };
}

/**
 * Generate batch download URLs for multiple assets
 */
export async function generateBatchDownloadUrls(
  db: SupabaseClient,
  storage: StorageProvider,
  request: BatchDownloadRequest
): Promise<BatchDownloadResponse> {
  const results: BatchDownloadResponse["urls"] = [];
  let totalSize = 0;
  const expiresIn = request.expiresInSeconds || 3600;
  const expiresAt = new Date(Date.now() + expiresIn * 1000);

  for (const assetId of request.assetIds) {
    try {
      const single = await generateDownloadUrl(db, storage, {
        assetId,
        userId: request.userId,
        tenantId: request.tenantId,
        expiresInSeconds: expiresIn,
      });

      results.push({
        assetId,
        url: single.url,
        filename: single.filename,
        expiresAt: single.expiresAt,
      });

      totalSize += single.size;
    } catch (err) {
      console.error(`[DownloadAPI] Skipping asset ${assetId}:`, err);
      // Continue with other assets
    }
  }

  if (results.length === 0) {
    throw new DownloadError("No valid assets found for download", 404);
  }

  return {
    urls: results,
    expiresAt: expiresAt.toISOString(),
    totalSize,
  };
}

/**
 * Verify user has access to an asset
 */
async function verifyAssetAccess(
  db: SupabaseClient,
  assetId: string,
  userId: string,
  tenantId?: string
): Promise<
  | {
      id: string;
      storageKey: string | null;
      filename: string | null;
      mimeType: string | null;
      size: number;
      threadId: string | null;
    }
  | null
> {
  // Query asset with ownership check
  let query = db
    .from("assets")
    .select("id, content_ref, thread_id, kind, title")
    .eq("id", assetId);

  // If tenant scope specified, enforce it
  if (tenantId) {
    query = query.eq("thread_id", tenantId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  // TODO: Additional permission checks (run ownership, sharing, etc.)
  // For now, we rely on the thread_id/tenant isolation

  // Extract file info from content_ref or derive from asset
  const contentRef = data.content_ref || "";
  const parts = contentRef.split("/");
  const filename = parts[parts.length - 1] || `${data.id}.bin`;

  return {
    id: data.id,
    storageKey: contentRef || null,
    filename,
    mimeType: getMimeTypeFromFilename(filename),
    size: 0, // Would need to query storage or cache
    threadId: data.thread_id,
  };
}

/**
 * Log download access for audit
 */
async function logDownloadAccess(
  db: SupabaseClient,
  request: DownloadUrlRequest,
  asset: { id: string; threadId: string | null }
): Promise<void> {
  try {
    // Try to import audit logger if available
    const { createAuditLogger } = await import("../../../../admin/audit");
    const logger = createAuditLogger(db, {
      userId: request.userId,
      tenantId: request.tenantId || asset.threadId || undefined,
    });

    await logger.log("asset.download", "assets", {
      assetId: asset.id,
      fileId: request.fileId,
      expiresInSeconds: request.expiresInSeconds,
    });
  } catch {
    // Audit logging is optional
    console.log(`[DownloadAPI] Access: user=${request.userId} asset=${asset.id}`);
  }
}

/**
 * Get MIME type from filename extension
 */
function getMimeTypeFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    pdf: "application/pdf",
    xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    xls: "application/vnd.ms-excel",
    csv: "text/csv",
    json: "application/json",
    txt: "text/plain",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    html: "text/html",
    md: "text/markdown",
  };

  return mimeTypes[ext || ""] || "application/octet-stream";
}

/**
 * Custom error for download operations
 */
export class DownloadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "DownloadError";
    this.statusCode = statusCode;
  }
}

/**
 * Validate a download URL hasn't expired
 */
export function isDownloadUrlValid(expiresAt: string): boolean {
  return new Date(expiresAt) > new Date();
}

/**
 * Refresh an expiring download URL
 */
export async function refreshDownloadUrl(
  db: SupabaseClient,
  storage: StorageProvider,
  assetId: string,
  userId: string,
  currentExpiresAt: string,
  newExpiresInSeconds = 3600
): Promise<DownloadUrlResponse | null> {
  // Only refresh if URL is about to expire (within 5 minutes)
  const expiresAt = new Date(currentExpiresAt);
  const fiveMinutes = 5 * 60 * 1000;

  if (expiresAt.getTime() - Date.now() > fiveMinutes) {
    // URL still valid, no refresh needed
    return null;
  }

  return generateDownloadUrl(db, storage, {
    assetId,
    userId,
    expiresInSeconds: newExpiresInSeconds,
  });
}
