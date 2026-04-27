/**
 * Asset Cleanup Worker — Architecture Finale
 *
 * Cron-based garbage collection for expired/orphaned assets.
 * Path: lib/engine/runtime/assets/cleanup/worker.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { StorageProvider } from "../storage/types";

export interface CleanupConfig {
  /** Default retention period in days */
  defaultTtlDays: number;
  /** Archive to cold storage after this many days (0 = no archive) */
  archiveAfterDays: number;
  /** Delete archived files after this many days (0 = keep forever) */
  deleteArchivedAfterDays: number;
  /** Dry run - only log, don't delete */
  dryRun: boolean;
  /** Maximum assets to process per run */
  batchSize: number;
  /** Tenant-specific overrides */
  tenantOverrides?: Record<string, { ttlDays: number; archiveAfterDays: number }>;
}

export interface CleanupResult {
  /** Assets marked for deletion */
  assetsMarked: number;
  /** Assets actually deleted */
  assetsDeleted: number;
  /** Files deleted from storage */
  filesDeleted: number;
  /** Assets archived to cold storage */
  assetsArchived: number;
  /** Errors encountered */
  errors: number;
  /** Processing duration in ms */
  durationMs: number;
  /** Details by tenant */
  byTenant: Record<string, { deleted: number; archived: number; errors: number }>;
}

/**
 * Run asset cleanup job
 */
export async function runAssetCleanup(
  db: SupabaseClient,
  storage: StorageProvider,
  config: CleanupConfig
): Promise<CleanupResult> {
  const start = Date.now();
  const result: CleanupResult = {
    assetsMarked: 0,
    assetsDeleted: 0,
    filesDeleted: 0,
    assetsArchived: 0,
    errors: 0,
    durationMs: 0,
    byTenant: {},
  };

  try {
    // 1. Find expired assets
    const expiredAssets = await findExpiredAssets(db, config);
    result.assetsMarked = expiredAssets.length;

    if (config.dryRun) {
      console.log(`[CleanupWorker] DRY RUN: Would delete ${expiredAssets.length} assets`);
      for (const asset of expiredAssets.slice(0, 10)) {
        console.log(`[CleanupWorker] Would delete: ${asset.id} (age: ${asset.ageDays} days)`);
      }
      result.durationMs = Date.now() - start;
      return result;
    }

    // 2. Process deletions
    for (const asset of expiredAssets) {
      try {
        await deleteAsset(db, storage, asset);
        result.assetsDeleted++;

        // Track by tenant
        const tenantKey = asset.tenantId || "global";
        if (!result.byTenant[tenantKey]) {
          result.byTenant[tenantKey] = { deleted: 0, archived: 0, errors: 0 };
        }
        result.byTenant[tenantKey].deleted++;
      } catch (err) {
        console.error(`[CleanupWorker] Failed to delete asset ${asset.id}:`, err);
        result.errors++;

        const tenantKey = asset.tenantId || "global";
        if (!result.byTenant[tenantKey]) {
          result.byTenant[tenantKey] = { deleted: 0, archived: 0, errors: 0 };
        }
        result.byTenant[tenantKey].errors++;
      }
    }

    // 3. Find orphaned storage files
    const orphanedFiles = await findOrphanedFiles(db, storage);
    if (!config.dryRun) {
      for (const file of orphanedFiles) {
        try {
          await storage.delete?.(file.key);
          result.filesDeleted++;
        } catch (err) {
          console.error(`[CleanupWorker] Failed to delete orphaned file ${file.key}:`, err);
          result.errors++;
        }
      }
    }

    console.log(`[CleanupWorker] Completed: ${result.assetsDeleted} assets, ${result.filesDeleted} orphaned files deleted`);
  } catch (err) {
    console.error("[CleanupWorker] Fatal error:", err);
    result.errors++;
  }

  result.durationMs = Date.now() - start;
  return result;
}

/**
 * Find assets that have exceeded their TTL
 */
async function findExpiredAssets(
  db: SupabaseClient,
  config: CleanupConfig
): Promise<
  Array<{
    id: string;
    storageKey: string;
    tenantId?: string;
    ageDays: number;
    shouldArchive: boolean;
  }>
> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.defaultTtlDays);

  const { data, error } = await db
    .from("assets")
    .select("id, content_ref, created_at, thread_id")
    .lt("created_at", cutoffDate.toISOString())
    .order("created_at", { ascending: true })
    .limit(config.batchSize);

  if (error) {
    console.error("[CleanupWorker] Failed to query expired assets:", error);
    return [];
  }

  return (data || []).map((row) => {
    const createdAt = new Date(row.created_at);
    const ageDays = Math.floor(
      (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Check tenant-specific archive window
    const tenantOverride = config.tenantOverrides?.[row.thread_id || "global"];
    const effectiveArchive = tenantOverride?.archiveAfterDays || config.archiveAfterDays;

    return {
      id: row.id,
      storageKey: row.content_ref,
      tenantId: row.thread_id, // Using thread_id as tenant proxy
      ageDays,
      shouldArchive: effectiveArchive > 0 && ageDays >= effectiveArchive,
    };
  });
}

/**
 * Delete an asset and its storage
 */
async function deleteAsset(
  db: SupabaseClient,
  storage: StorageProvider,
  asset: {
    id: string;
    storageKey: string;
    shouldArchive: boolean;
  }
): Promise<void> {
  // Delete from storage first (idempotent)
  if (asset.storageKey) {
    try {
      await storage.delete?.(asset.storageKey);
    } catch (err) {
      // Log but continue - file might already be gone
      console.warn(`[CleanupWorker] Storage delete warning for ${asset.id}:`, err);
    }
  }

  // Delete from database
  const { error } = await db.from("assets").delete().eq("id", asset.id);

  if (error) {
    throw new Error(`Database delete failed: ${error.message}`);
  }
}

/**
 * Find orphaned files in storage (not referenced in DB)
 */
async function findOrphanedFiles(
  _db: SupabaseClient,
  _storage: StorageProvider
): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
  // This is provider-specific and may require listing all storage files
  // For now, return empty - implement per-provider
  console.log("[CleanupWorker] Orphaned file detection not implemented for this storage provider");
  return [];
}

/**
 * Cleanup assets for a specific tenant
 */
export async function cleanupTenantAssets(
  db: SupabaseClient,
  storage: StorageProvider,
  tenantId: string,
  ttlDays: number,
  dryRun = false
): Promise<{ deleted: number; errors: number }> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - ttlDays);

  const { data, error } = await db
    .from("assets")
    .select("id, content_ref")
    .eq("thread_id", tenantId)
    .lt("created_at", cutoffDate.toISOString());

  if (error) {
    console.error(`[CleanupWorker] Failed to query tenant ${tenantId} assets:`, error);
    return { deleted: 0, errors: 1 };
  }

  let deleted = 0;
  let errors = 0;

  for (const row of data || []) {
    try {
      if (!dryRun) {
        if (row.content_ref) {
          await storage.delete?.(row.content_ref);
        }
        await db.from("assets").delete().eq("id", row.id);
      }
      deleted++;
    } catch (err) {
      console.error(`[CleanupWorker] Failed to delete tenant asset ${row.id}:`, err);
      errors++;
    }
  }

  console.log(`[CleanupWorker] Tenant ${tenantId}: ${deleted} assets ${dryRun ? "would be " : ""}deleted, ${errors} errors`);

  return { deleted, errors };
}

/**
 * Get cleanup statistics
 */
export async function getCleanupStats(
  db: SupabaseClient
): Promise<{
  totalAssets: number;
  assetsByAge: {
    last24h: number;
    last7d: number;
    last30d: number;
    older: number;
  };
}> {
  const now = new Date();
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [totalResult, last24hResult, last7dResult, last30dResult] = await Promise.all([
    db.from("assets").select("*", { count: "exact", head: true }),
    db.from("assets").select("*", { count: "exact", head: true }).gte("created_at", dayAgo),
    db.from("assets").select("*", { count: "exact", head: true }).gte("created_at", weekAgo),
    db.from("assets").select("*", { count: "exact", head: true }).gte("created_at", monthAgo),
  ]);

  const total = totalResult.count ?? 0;
  const last24h = last24hResult.count ?? 0;
  const last7d = last7dResult.count ?? 0;
  const last30d = last30dResult.count ?? 0;

  return {
    totalAssets: total,
    assetsByAge: {
      last24h,
      last7d: last7d - last24h,
      last30d: last30d - last7d,
      older: total - last30d,
    },
  };
}
