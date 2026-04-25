/**
 * Asset List API — Architecture Finale
 *
 * Paginated listing of assets with filters.
 * Path: lib/engine/runtime/assets/api/list.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export interface ListAssetsRequest {
  tenantId?: string;
  runId?: string;
  threadId?: string;
  type?: string;
  userId?: string;
  limit?: number;
  offset?: number;
  sortBy?: "created_at" | "updated_at" | "title";
  sortOrder?: "asc" | "desc";
  search?: string;
  includeDeleted?: boolean;
}

export interface AssetFileInfo {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  storageKey: string;
  url?: string;
}

export interface AssetListItem {
  id: string;
  type: string;
  title: string;
  summary?: string;
  status: "active" | "archived" | "deleted";
  createdAt: string;
  updatedAt?: string;
  threadId: string;
  runId?: string;
  userId?: string;
  files: AssetFileInfo[];
  metadata?: Record<string, unknown>;
}

export interface ListAssetsResponse {
  assets: AssetListItem[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
}

/**
 * List assets with pagination and filtering
 */
export async function listAssets(
  db: SupabaseClient,
  request: ListAssetsRequest = {}
): Promise<ListAssetsResponse> {
  const pageSize = Math.min(request.limit ?? 20, 100);
  const offset = request.offset ?? 0;
  const page = Math.floor(offset / pageSize) + 1;

  // Build base query
  let query = db.from("assets").select("*", { count: "exact" });

  // Apply filters
  if (request.tenantId || request.threadId) {
    query = query.eq("thread_id", request.tenantId || request.threadId);
  }

  if (request.runId) {
    query = query.eq("run_id", request.runId);
  }

  if (request.type) {
    query = query.eq("kind", request.type);
  }

  if (request.userId) {
    // Note: assets table doesn't have user_id directly, would need join with runs
    // For now, this is a placeholder
  }

  if (!request.includeDeleted) {
    // Filter out deleted/archived if not explicitly requested
    // This assumes a status column or similar - adjust based on actual schema
  }

  if (request.search) {
    query = query.or(`title.ilike.%${request.search}%,summary.ilike.%${request.search}%`);
  }

  // Apply sorting
  const sortColumn = request.sortBy ?? "created_at";
  const sortAscending = request.sortOrder === "asc";
  query = query.order(sortColumn, { ascending: sortAscending });

  // Apply pagination
  query = query.range(offset, offset + pageSize - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[AssetAPI/List] Failed to list assets:", error);
    throw new Error(`Failed to list assets: ${error.message}`);
  }

  // Transform to response format
  const assets: AssetListItem[] = (data || []).map((row) => ({
    id: row.id,
    type: row.kind,
    title: row.title,
    summary: row.summary,
    status: "active", // Default, could be derived from other fields
    createdAt: row.created_at,
    updatedAt: row.created_at, // Assets don't have updated_at currently
    threadId: row.thread_id,
    runId: row.run_id,
    files: extractFilesFromAsset(row),
    metadata: row.provenance,
  }));

  const total = count ?? 0;
  const hasMore = offset + assets.length < total;

  return {
    assets,
    total,
    hasMore,
    page,
    pageSize,
  };
}

/**
 * Get a single asset by ID
 */
export async function getAsset(
  db: SupabaseClient,
  assetId: string,
  tenantId?: string
): Promise<AssetListItem | null> {
  let query = db.from("assets").select("*").eq("id", assetId);

  if (tenantId) {
    query = query.eq("thread_id", tenantId);
  }

  const { data, error } = await query.single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("[AssetAPI/List] Failed to get asset:", error);
    throw new Error(`Failed to get asset: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id,
    type: data.kind,
    title: data.title,
    summary: data.summary,
    status: "active",
    createdAt: data.created_at,
    updatedAt: data.created_at,
    threadId: data.thread_id,
    runId: data.run_id,
    files: extractFilesFromAsset(data),
    metadata: data.provenance,
  };
}

/**
 * Count assets by criteria
 */
export async function countAssets(
  db: SupabaseClient,
  filters?: Omit<ListAssetsRequest, "limit" | "offset" | "sortBy" | "sortOrder">
): Promise<{ total: number; byType: Record<string, number> }> {
  let query = db.from("assets").select("kind", { count: "exact" });

  if (filters?.tenantId || filters?.threadId) {
    query = query.eq("thread_id", filters.tenantId || filters.threadId!);
  }

  if (filters?.runId) {
    query = query.eq("run_id", filters.runId);
  }

  const { count, error } = await query;

  if (error) {
    console.error("[AssetAPI/List] Failed to count assets:", error);
    throw new Error(`Failed to count assets: ${error.message}`);
  }

  // Get breakdown by type
  let typeQuery = db.from("assets").select("kind");

  if (filters?.tenantId || filters?.threadId) {
    typeQuery = typeQuery.eq("thread_id", filters.tenantId || filters.threadId!);
  }

  const { data: typeData, error: typeError } = await typeQuery;

  if (typeError) {
    return { total: count ?? 0, byType: {} };
  }

  const byType: Record<string, number> = {};
  for (const row of typeData || []) {
    byType[row.kind] = (byType[row.kind] || 0) + 1;
  }

  return {
    total: count ?? 0,
    byType,
  };
}

/**
 * Search assets with full-text search (if enabled in DB)
 */
export async function searchAssets(
  db: SupabaseClient,
  query: string,
  options?: {
    tenantId?: string;
    limit?: number;
  }
): Promise<AssetListItem[]> {
  const limit = Math.min(options?.limit ?? 20, 100);

  let dbQuery = db
    .from("assets")
    .select("*")
    .or(`title.ilike.%${query}%,summary.ilike.%${query}%`)
    .limit(limit);

  if (options?.tenantId) {
    dbQuery = dbQuery.eq("thread_id", options.tenantId);
  }

  const { data, error } = await dbQuery;

  if (error) {
    console.error("[AssetAPI/List] Failed to search assets:", error);
    throw new Error(`Failed to search assets: ${error.message}`);
  }

  return (data || []).map((row) => ({
    id: row.id,
    type: row.kind,
    title: row.title,
    summary: row.summary,
    status: "active",
    createdAt: row.created_at,
    updatedAt: row.created_at,
    threadId: row.thread_id,
    runId: row.run_id,
    files: extractFilesFromAsset(row),
    metadata: row.provenance,
  }));
}

/**
 * Extract file info from asset row
 */
function extractFilesFromAsset(row: Record<string, unknown>): AssetFileInfo[] {
  const files: AssetFileInfo[] = [];

  // Main content_ref file
  if (row.content_ref) {
    const contentRef = row.content_ref as string;
    const parts = contentRef.split("/");
    const filename = parts[parts.length - 1] || "unknown";

    files.push({
      id: "main",
      filename,
      mimeType: guessMimeType(filename),
      size: 0, // Would need to query storage
      storageKey: contentRef,
    });
  }

  // Additional files could be in provenance or other fields
  const provenance = row.provenance as Record<string, unknown> | undefined;
  if (provenance?.files && Array.isArray(provenance.files)) {
    for (const file of provenance.files as Array<Record<string, string>>) {
      files.push({
        id: file.id || `file-${files.length}`,
        filename: file.filename || file.name || "unknown",
        mimeType: file.mimeType || guessMimeType(file.filename || ""),
        size: parseInt(file.size || "0", 10) || 0,
        storageKey: file.storageKey || file.path || "",
        url: file.url,
      });
    }
  }

  return files;
}

/**
 * Guess MIME type from filename
 */
function guessMimeType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() || "";

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
    docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    doc: "application/msword",
    zip: "application/zip",
  };

  return mimeTypes[ext] || "application/octet-stream";
}
