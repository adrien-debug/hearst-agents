/**
 * Asset Upload API — Architecture Finale
 *
 * Handles direct file uploads (future feature).
 * Path: lib/engine/runtime/assets/api/upload.ts
 * Status: Stub — Upload implementation pending
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface UploadRequest {
  tenantId: string;
  runId: string;
  filename: string;
  mimeType: string;
  size: number;
}

export interface UploadResponse {
  uploadUrl: string;
  assetId: string;
  expiresAt: string;
}

export async function initiateUpload(
  db: SupabaseClient,
  request: UploadRequest
): Promise<UploadResponse> {
  // TODO: Implement multipart upload initiation
  // 1. Create asset record
  // 2. Generate presigned upload URL(s)
  // 3. Return upload session info
  throw new Error("Direct upload not yet implemented");
}
