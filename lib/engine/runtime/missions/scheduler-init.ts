/**
 * Scheduler Singleton Init — ensures startScheduler() runs exactly once.
 *
 * Primary call site: instrumentation.ts (runs at server boot, no traffic needed).
 * Secondary call site: /api/orchestrate/route.ts (module scope, fallback guard).
 *
 * Duplicate-safe: globalThis guard survives hot-reload in dev,
 * and startScheduler() itself has an internal intervalId guard.
 *
 * Leadership: acquires a DB-backed lease on boot and renews it every 30s.
 * Non-leader instances still run the scheduler loop but skip tick bodies.
 * If DB is unavailable (dev), assumes leader automatically.
 */

import { startScheduler, type SchedulerTriggerFn, type IsLeaderFn } from "./scheduler";
import type { ScheduledMission } from "./types";
import type { SchedulerMode } from "./ops-types";
import { requireServerSupabase } from "@/lib/supabase-server";
import { orchestrate } from "@/lib/engine/orchestrator/index";
import {
  tryAcquireSchedulerLeadership,
  renewSchedulerLeadership,
} from "./leader-lease";
import { cleanupExpiredSchedulerLeases } from "./cleanup-leases";
import { INSTANCE_ID } from "../instance-id";

const GLOBAL_KEY = "__hearst_scheduler_started__";
const HEARTBEAT_INTERVAL_MS = 30_000;
const CLEANUP_EVERY_N_HEARTBEATS = 10; // ~5 min

function isStarted(): boolean {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] === true;
}

function markStarted(): void {
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = true;
}

// ── Leadership state ─────────────────────────────────────

let _isLeader = false;
let _dbAvailable = true;
let _heartbeatCount = 0;

/**
 * Current scheduler mode — readable by status API.
 */
export function getSchedulerMode(): SchedulerMode {
  if (!_dbAvailable) return "local_fallback";
  return _isLeader ? "leader" : "standby";
}

async function acquireLeadership(): Promise<void> {
  const acquired = await tryAcquireSchedulerLeadership();
  if (acquired && !_isLeader) {
    _isLeader = true;
    console.log(`[Scheduler] Leadership acquired by ${INSTANCE_ID}`);
  } else if (!acquired && _isLeader) {
    _isLeader = false;
    console.log(`[Scheduler] Leadership lost — entering standby`);
  } else if (!acquired) {
    console.log(`[Scheduler] Standby mode (${INSTANCE_ID})`);
  }
}

async function heartbeat(): Promise<void> {
  _heartbeatCount++;

  if (_isLeader) {
    const renewed = await renewSchedulerLeadership();
    if (!renewed) {
      _isLeader = false;
      console.log(`[Scheduler] Leadership lost — entering standby`);
      await acquireLeadership();
    }
  } else {
    await acquireLeadership();
  }

  // Periodic lease cleanup (leader only)
  if (_isLeader && _heartbeatCount % CLEANUP_EVERY_N_HEARTBEATS === 0) {
    try {
      const { deleted } = await cleanupExpiredSchedulerLeases();
      if (deleted > 0) {
        console.log(`[Scheduler] Cleaned ${deleted} expired lease(s)`);
      }
    } catch (e) {
      console.error("[Scheduler] Lease cleanup error:", e);
    }
  }
}

function startHeartbeat(): void {
  setInterval(() => {
    heartbeat().catch((e) =>
      console.error("[Scheduler] Heartbeat error:", e),
    );
  }, HEARTBEAT_INTERVAL_MS);
}

// ── Stream drain helper ──────────────────────────────────

async function drainStream(stream: ReadableStream): Promise<string | null> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let runId: string | null = null;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      if (!runId) {
        const match = chunk.match(/"run_id"\s*:\s*"([^"]+)"/);
        if (match) runId = match[1];
      }
    }
  } catch (err) {
    console.error("[Scheduler] Stream drain error:", err);
  } finally {
    reader.releaseLock();
  }

  return runId;
}

// ── Trigger builder ──────────────────────────────────────

function buildTrigger(): SchedulerTriggerFn {
  return async (mission: ScheduledMission): Promise<string | null> => {
    const db = requireServerSupabase();

    const stream = orchestrate(db, {
      userId: mission.userId,
      message: mission.input,
      missionId: mission.id,
      tenantId: mission.tenantId,
      workspaceId: mission.workspaceId,
      surface: "scheduler",
    });

    return drainStream(stream);
  };
}

// ── IsLeader function passed to scheduler ────────────────

function buildIsLeader(): IsLeaderFn {
  return async () => _isLeader;
}

// ── Public entry ─────────────────────────────────────────

export async function ensureSchedulerStarted(): Promise<void> {
  if (isStarted()) return;
  markStarted();

  console.log(`[Scheduler] Initializing… (${INSTANCE_ID})`);

  // Check if DB is available
  try {
    requireServerSupabase();
  } catch {
    _dbAvailable = false;
    _isLeader = true; // local fallback
    console.log(`[Scheduler] No DB — local fallback mode`);
  }

  if (_dbAvailable) {
    await acquireLeadership();
  }

  const trigger = buildTrigger();
  const isLeader = buildIsLeader();
  startScheduler(trigger, isLeader);

  if (_dbAvailable) {
    startHeartbeat();
  }
}
