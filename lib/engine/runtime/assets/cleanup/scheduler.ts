/**
 * Asset Cleanup Scheduler — Architecture Finale
 *
 * Schedules periodic cleanup jobs.
 * Path: lib/engine/runtime/assets/cleanup/scheduler.ts
 * Status: Stub — Scheduler integration pending
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { runAssetCleanup } from "./worker";

export interface SchedulerConfig {
  cronExpression: string; // e.g., "0 2 * * *" (daily at 2am)
  enabled: boolean;
}

export class CleanupScheduler {
  private config: SchedulerConfig;
  private db: SupabaseClient;

  constructor(db: SupabaseClient, config: SchedulerConfig) {
    this.db = db;
    this.config = config;
  }

  start(): void {
    if (!this.config.enabled) {
      console.log("[CleanupScheduler] Disabled");
      return;
    }
    // TODO: Integrate with actual cron/job scheduler
    console.log(`[CleanupScheduler] Started with cron: ${this.config.cronExpression}`);
  }

  stop(): void {
    console.log("[CleanupScheduler] Stopped");
  }

  async runNow(): Promise<{ deleted: number; archived: number; errors: number }> {
    return runAssetCleanup(this.db, {
      defaultTtlDays: 30,
      archiveAfterDays: 90,
      dryRun: false,
    });
  }
}
