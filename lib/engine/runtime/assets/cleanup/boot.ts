/**
 * Cleanup Scheduler Boot — ensures the cleanup scheduler starts exactly once.
 *
 * Call site: instrumentation.ts (runs at server boot).
 * Duplicate-safe via globalThis guard.
 *
 * Reads schedule from ASSET_CLEANUP_CRON env var (default: "0 2 * * *" = 2am daily).
 * Disable with ASSET_CLEANUP_ENABLED=false.
 */

import { CleanupScheduler } from "./scheduler";
import { getGlobalStorage } from "../storage";

const GLOBAL_KEY = "__hearst_cleanup_scheduler__";

let scheduler: CleanupScheduler | null = null;

function isStarted(): boolean {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] === true;
}

function markStarted(): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = true;
}

export async function ensureCleanupSchedulerStarted(): Promise<void> {
  if (isStarted()) return;
  markStarted();

  const enabled = process.env.ASSET_CLEANUP_ENABLED !== "false";
  const cron = process.env.ASSET_CLEANUP_CRON || "0 2 * * *";
  const ttlDays = parseInt(process.env.ASSET_CLEANUP_TTL_DAYS || "30", 10);
  const dryRun = process.env.ASSET_CLEANUP_DRY_RUN === "true";

  if (!enabled) {
    console.log("[CleanupBoot] Asset cleanup scheduler disabled via ASSET_CLEANUP_ENABLED=false");
    return;
  }

  try {
    const { requireServerSupabase } = await import("@/lib/platform/db/supabase");
    const db = requireServerSupabase();
    const storage = getGlobalStorage();

    scheduler = new CleanupScheduler(db, storage, {
      cronExpression: cron,
      enabled: true,
      cleanupConfig: {
        defaultTtlDays: ttlDays,
        dryRun,
        batchSize: 500,
      },
    });

    scheduler.start();
    console.log(`[CleanupBoot] Asset cleanup scheduler started (cron=${cron}, ttl=${ttlDays}d, dryRun=${dryRun})`);
  } catch (err) {
    console.warn("[CleanupBoot] Failed to start cleanup scheduler:", err);
  }
}

