/**
 * Asset Upload API — Architecture Finale
 *
 * Handles direct file uploads with multipart support.
 * Path: lib/engine/runtime/assets/api/upload.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "../storage/types";

export interface UploadRequest {
  tenantId: string;
  runId?: string;
  threadId?: string;
  userId: string;
  filename: string;
  mimeType: string;
  size: number;
  metadata?: Record<string, unknown>;
}

export interface UploadResponse {
  uploadUrl: string;
  assetId: string;
  storageKey: string;
  expiresAt: string;
  fields?: Record<string, string>; // For multipart/form-data
  method: "PUT" | "POST";
}

export interface MultipartUploadRequest {
  tenantId: string;
  userId: string;
  filename: string;
  mimeType: string;
  totalSize: number;
  partSize?: number; // Default 5MB
}

export interface MultipartUploadResponse {
  uploadId: string;
  assetId: string;
  parts: Array<{
    partNumber: number;
    uploadUrl: string;
    expiresAt: string;
  }>;
  completeUrl: string;
}

export interface CompleteUploadRequest {
  uploadId: string;
  assetId: string;
  parts: Array<{
    partNumber: number;
    etag: string;
  }>;
}

export interface UploadStatus {
  id: string;
  status: "pending" | "uploading" | "completed" | "failed";
  progress: number;
  uploadedBytes: number;
  totalBytes: number;
  error?: string;
  completedAt?: string;
}

/**
 * Initiate a direct upload
 */
export async function initiateUpload(
  db: SupabaseClient,
  storage: StorageProvider,
  request: UploadRequest
): Promise<UploadResponse> {
  // Validate file size limits
  const maxSize = await getMaxUploadSize(db, request.tenantId);
  if (request.size > maxSize) {
    throw new UploadError(
      `File size ${request.size} exceeds limit ${maxSize}`,
      413
    );
  }

  // Generate storage key
  const timestamp = Date.now();
  const sanitizedFilename = sanitizeFilename(request.filename);
  const storageKey = `uploads/${request.tenantId}/${timestamp}_${sanitizedFilename}`;

  // Create asset record
  const { data: asset, error: assetError } = await db
    .from("assets")
    .insert({
      thread_id: request.threadId || request.tenantId,
      run_id: request.runId,
      kind: guessAssetKind(request.mimeType),
      title: request.filename,
      content_ref: storageKey,
      provenance: {
        upload: {
          userId: request.userId,
          filename: request.filename,
          mimeType: request.mimeType,
          size: request.size,
          uploadedAt: new Date().toISOString(),
        },
        ...request.metadata,
      },
    })
    .select()
    .single();

  if (assetError || !asset) {
    console.error("[UploadAPI] Failed to create asset:", assetError);
    throw new UploadError(
      `Failed to create asset: ${assetError?.message || "Unknown error"}`,
      500
    );
  }

  // Generate signed upload URL
  try {
    const signedUrlResult = await storage.getSignedUrl(storageKey, "write", {
      expiresInSeconds: 3600,
    });

    return {
      uploadUrl: signedUrlResult,
      assetId: asset.id,
      storageKey,
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
      method: "PUT",
    };
  } catch (err) {
    // Rollback asset creation
    await db.from("assets").delete().eq("id", asset.id);

    console.error("[UploadAPI] Failed to generate upload URL:", err);
    throw new UploadError(
      `Failed to generate upload URL: ${err instanceof Error ? err.message : "Unknown error"}`,
      500
    );
  }
}

/**
 * Initiate multipart upload for large files
 */
export async function initiateMultipartUpload(
  db: SupabaseClient,
  storage: StorageProvider,
  request: MultipartUploadRequest
): Promise<MultipartUploadResponse> {
  const partSize = request.partSize || 5 * 1024 * 1024; // 5MB default
  const numParts = Math.ceil(request.totalSize / partSize);

  if (numParts > 1000) {
    throw new UploadError("File too large: max 1000 parts", 413);
  }

  // Generate upload ID
  const uploadId = `mpu_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const storageKey = `uploads/${request.tenantId}/${uploadId}_${sanitizeFilename(request.filename)}`;

  // Create placeholder asset
  const { data: asset, error: assetError } = await db
    .from("assets")
    .insert({
      thread_id: request.tenantId,
      kind: guessAssetKind(request.mimeType),
      title: request.filename,
      content_ref: storageKey,
      provenance: {
        upload: {
          userId: request.userId,
          filename: request.filename,
          mimeType: request.mimeType,
          size: request.totalSize,
          multipart: true,
          uploadId,
          parts: numParts,
        },
      },
    })
    .select()
    .single();

  if (assetError || !asset) {
    throw new UploadError(
      `Failed to create asset: ${assetError?.message || "Unknown error"}`,
      500
    );
  }

  // Generate presigned URLs for each part
  // Note: This depends on storage provider supporting multipart
  const parts: MultipartUploadResponse["parts"] = [];
  for (let i = 1; i <= Math.min(numParts, 10); i++) {
    // In practice, we'd generate URLs on-demand as client progresses
    parts.push({
      partNumber: i,
      uploadUrl: `${storageKey}?part=${i}&uploadId=${uploadId}`,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  }

  return {
    uploadId,
    assetId: asset.id,
    parts,
    completeUrl: `/api/v2/assets/${asset.id}/complete-upload`,
  };
}

/**
 * Complete a multipart upload
 */
export async function completeMultipartUpload(
  db: SupabaseClient,
  storage: StorageProvider,
  request: CompleteUploadRequest
): Promise<{ assetId: string; status: string }> {
  // Verify all parts uploaded
  // This is storage-provider specific

  // Update asset status
  const { error } = await db
    .from("assets")
    .update({
      provenance: {
        completed: true,
        completedAt: new Date().toISOString(),
      },
    })
    .eq("id", request.assetId);

  if (error) {
    throw new UploadError(`Failed to complete upload: ${error.message}`, 500);
  }

  return {
    assetId: request.assetId,
    status: "completed",
  };
}

/**
 * Abort a multipart upload
 */
export async function abortMultipartUpload(
  db: SupabaseClient,
  storage: StorageProvider,
  uploadId: string,
  assetId: string
): Promise<void> {
  // Delete uploaded parts from storage
  // Storage-provider specific

  // Delete asset record
  await db.from("assets").delete().eq("id", assetId);
}

/**
 * Get upload status/progress
 */
export async function getUploadStatus(
  db: SupabaseClient,
  assetId: string
): Promise<UploadStatus> {
  const { data, error } = await db
    .from("assets")
    .select("id, provenance, created_at")
    .eq("id", assetId)
    .single();

  if (error || !data) {
    throw new UploadError("Upload not found", 404);
  }

  const provenance = data.provenance as Record<string, unknown> | undefined;
  const uploadInfo = provenance?.upload as Record<string, unknown> | undefined;

  return {
    id: assetId,
    status: (uploadInfo?.status as UploadStatus["status"]) || "pending",
    progress: (uploadInfo?.progress as number) || 0,
    uploadedBytes: (uploadInfo?.uploadedBytes as number) || 0,
    totalBytes: (uploadInfo?.size as number) || 0,
    error: uploadInfo?.error as string | undefined,
    completedAt: uploadInfo?.completedAt as string | undefined,
  };
}

/**
 * Get max upload size from settings
 */
async function getMaxUploadSize(
  db: SupabaseClient,
  tenantId?: string
): Promise<number> {
  try {
    // Try to get from system settings
    const { data, error } = await db
      .from("system_settings")
      .select("value")
      .eq("key", "upload.max_size_mb")
      .single();

    if (!error && data) {
      const mb = parseInt(data.value as string, 10) || 50;
      return mb * 1024 * 1024;
    }
  } catch {
    // Fall back to default
  }

  return 50 * 1024 * 1024; // 50MB default
}

/**
 * Sanitize filename for storage
 */
function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 255);
}

/**
 * Guess asset kind from MIME type
 */
function guessAssetKind(mimeType: string): string {
  if (mimeType.includes("pdf")) return "document";
  if (mimeType.includes("spreadsheet") || mimeType.includes("excel") || mimeType.includes("csv"))
    return "spreadsheet";
  if (mimeType.includes("image")) return "document";
  if (mimeType.includes("text")) return "document";
  return "document";
}

/**
 * Custom upload error
 */
export class UploadError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "UploadError";
    this.statusCode = statusCode;
  }
}

/**
 * Validate upload request
 */
export function validateUploadRequest(request: UploadRequest): void {
  if (!request.tenantId) {
    throw new UploadError("tenantId is required", 400);
  }
  if (!request.userId) {
    throw new UploadError("userId is required", 400);
  }
  if (!request.filename) {
    throw new UploadError("filename is required", 400);
  }
  if (!request.mimeType) {
    throw new UploadError("mimeType is required", 400);
  }
  if (request.size <= 0) {
    throw new UploadError("size must be positive", 400);
  }
}
