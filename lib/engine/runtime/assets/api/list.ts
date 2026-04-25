/**
 * Asset List API — Architecture Finale
 *
 * Paginated listing of assets with filters.
 * Path: lib/engine/runtime/assets/api/list.ts
 * Status: Stub — API implementation pending
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ListAssetsRequest {
  tenantId: string;
  runId?: string;
  type?: string;
  limit?: number;
  offset?: number;
}

export interface ListAssetsResponse {
  assets: Array<{
    id: string;
    type: string;
    title: string;
    createdAt: string;
    files: Array<{
      id: string;
      filename: string;
      mimeType: string;
      size: number;
    }>;
  }>;
  total: number;
  hasMore: boolean;
}

export async function listAssets(
  db: SupabaseClient,
  request: ListAssetsRequest
): Promise<ListAssetsResponse> {
  // TODO: Implement paginated asset listing
  // 1. Query asset_files table with filters
  // 2. Aggregate by asset_id
  // 3. Return paginated results
  return {
    assets: [],
    total: 0,
    hasMore: false,
  };
}
