/**
 * Scheduled Mission Scheduler — minimal polling loop.
 *
 * Checks every 60s if any enabled mission should run based on its schedule.
 * Uses a simple cron subset: "minute hour * * *" (minute + hour + day-of-week).
 *
 * Guard layers (in order):
 *   1. Leader lease — only the leader instance executes the tick body
 *   2. Minute dedup — prevents re-trigger within the same UTC minute
 *   3. In-memory lease — prevents same-process overlap for long runs
 *   4. Distributed lease — prevents cross-instance overlap for the same window
 *
 * On each tick, hydrates from Supabase if in-memory store is empty.
 */

import type { ScheduledMission } from "./types";
import { getEnabledMissions, addMission, getAllMissions, updateMissionLastRun } from "./store";
import { getScheduledMissions, updateScheduledMission as persistUpdateMission } from "../state/adapter";
import { isMissionRunning, markMissionRunning, markMissionCompleted } from "./lease";
import { tryAcquireMissionLease, releaseMissionLease } from "./distributed-lease";
import { setMissionRunning as opsRunning, setMissionResult as opsResult } from "./ops-store";
import { normalizeMissionResult } from "./normalize-result";
import { INSTANCE_ID } from "../instance-id";
import { buildExportJobPayload, runExportScheduledReportJob } from "./export-job";

const POLL_INTERVAL_MS = 60_000;
const triggeredThisMinute = new Set<string>();
let currentMinuteKey = "";
let intervalId: ReturnType<typeof setInterval> | null = null;
let hydrated = false;

// ── Minimal cron parser (minute + hour + day-of-week) ─────

interface ParsedSchedule {
  minute: number | null;
  hour: number | null;
  dow: number | null;
}

function parseSchedule(schedule: string): ParsedSchedule {
  const parts = schedule.trim().split(/\s+/);
  return {
    minute: parts[0] === "*" ? null : parseInt(parts[0], 10),
    hour: parts[1] === "*" ? null : parseInt(parts[1], 10),
    dow: parts.length >= 5 && parts[4] !== "*" ? parseInt(parts[4], 10) : null,
  };
}

function shouldRunNow(mission: ScheduledMission): boolean {
  const now = new Date();
  const parsed = parseSchedule(mission.schedule);

  if (parsed.minute !== null && now.getUTCMinutes() !== parsed.minute) return false;
  if (parsed.hour !== null && now.getUTCHours() !== parsed.hour) return false;
  if (parsed.dow !== null && now.getUTCDay() !== parsed.dow) return false;

  return true;
}

/** UTC minute bucket key for distributed dedup. */
function runWindowKey(missionId: string): string {
  const now = new Date();
  const d = now.toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  return `${missionId}:${d}`;
}

// ── Trigger function (injected) ──────────────────────────

export type SchedulerTriggerFn = (mission: ScheduledMission) => Promise<string | null>;

// ── Leadership check (injected by scheduler-init) ────────

export type IsLeaderFn = () => Promise<boolean>;

// ── Hydration from Supabase ──────────────────────────────

async function hydrateIfNeeded(): Promise<void> {
  if (hydrated) return;

  const inMemory = getAllMissions();
  if (inMemory.length > 0) {
    hydrated = true;
    return;
  }

  try {
    const persisted = await getScheduledMissions();
    for (const m of persisted) {
      addMission({
        id: m.id,
        tenantId: m.tenantId,
        workspaceId: m.workspaceId,
        userId: m.userId,
        name: m.name,
        input: m.input,
        schedule: m.schedule,
        enabled: m.enabled,
        createdAt: m.createdAt,
        lastRunAt: m.lastRunAt,
        lastRunId: m.lastRunId,
      });
    }
    hydrated = true;
    if (persisted.length > 0) {
      console.log(`[Scheduler] Hydrated ${persisted.length} mission(s) from Supabase`);
    }
  } catch (err) {
    console.error("[Scheduler] Hydration failed:", err);
  }
}

// ── Scheduler loop ───────────────────────────────────────

async function tick(
  trigger: SchedulerTriggerFn,
  isLeader: IsLeaderFn,
): Promise<void> {
  // Layer 1: leadership gate
  const leader = await isLeader();
  if (!leader) return; // standby instance — skip silently

  await hydrateIfNeeded();

  const now = new Date();
  const minuteKey = `${now.getUTCHours()}:${now.getUTCMinutes()}`;

  if (minuteKey !== currentMinuteKey) {
    currentMinuteKey = minuteKey;
    triggeredThisMinute.clear();
  }

  const missions = getEnabledMissions();

  for (const mission of missions) {
    // Layer 2: same-minute dedup
    if (triggeredThisMinute.has(mission.id)) continue;
    if (!shouldRunNow(mission)) continue;

    triggeredThisMinute.add(mission.id);

    if (!mission.tenantId || !mission.workspaceId) {
      console.warn(`[Scheduler] Mission skipped — missing tenant scope (${mission.id})`);
      continue;
    }

    // Layer 3: in-memory overlap guard
    if (isMissionRunning(mission.id)) {
      console.log(`[Scheduler] Mission "${mission.name}" skipped — already running (local)`);
      continue;
    }

    // Layer 4: distributed lease
    const windowKey = runWindowKey(mission.id);
    const acquired = await tryAcquireMissionLease({
      missionId: mission.id,
      runWindowKey: windowKey,
    });
    if (!acquired) {
      console.log(`[Scheduler] Mission "${mission.name}" skipped — lease held by another instance`);
      continue;
    }

    console.log(`[Scheduler] Triggering "${mission.name}" (${mission.id}) [${INSTANCE_ID}]`);
    markMissionRunning(mission.id);
    opsRunning(mission.id);

    try {
      const runId = await trigger(mission);
      const result = normalizeMissionResult({ runId, error: undefined });

      if (runId) {
        updateMissionLastRun(mission.id, runId);
      }

      opsResult(mission.id, { status: result.status, runId: runId ?? undefined, error: result.message });

      // Persist ops durably
      void persistUpdateMission(mission.id, {
        lastRunAt: Date.now(),
        lastRunId: runId ?? undefined,
        lastRunStatus: result.status,
        lastError: result.message ?? undefined,
      });

      if (result.status === "success") {
        console.log(`[Scheduler] Mission "${mission.name}" completed → run ${runId}`);
        // ── Webhook mission.completed (fire-and-forget) ───────
        try {
          const { dispatchWebhookEvent } = await import("@/lib/webhooks/dispatcher");
          dispatchWebhookEvent("mission.completed", mission.tenantId, {
            missionId: mission.id,
            missionName: mission.name,
            runId: runId ?? null,
          });
        } catch {
          // Webhook system unavailable — ignoré
        }
        // ── Export automatique si configuré ───────────────────
        if (mission.autoExport?.enabled) {
          const jobPayload = buildExportJobPayload(
            mission.id,
            mission.tenantId,
            mission.autoExport,
          );
          // Fire-and-forget : l'échec de l'export ne doit pas impacter le run.
          runExportScheduledReportJob(jobPayload).catch((err) => {
            console.error(
              `[Scheduler] export-job failed for mission "${mission.name}":`,
              err,
            );
          });
        }
      } else {
        console.warn(`[Scheduler] Mission "${mission.name}" finished with status: ${result.status}`);
      }
    } catch (err) {
      const result = normalizeMissionResult({ error: err });
      opsResult(mission.id, { status: result.status, error: result.message });

      // Persist failure durably
      void persistUpdateMission(mission.id, {
        lastRunAt: Date.now(),
        lastRunStatus: result.status,
        lastError: result.message,
      });

      // ── Webhook mission.failed (fire-and-forget) ───────────
      try {
        const { dispatchWebhookEvent } = await import("@/lib/webhooks/dispatcher");
        dispatchWebhookEvent("mission.failed", mission.tenantId, {
          missionId: mission.id,
          missionName: mission.name,
          error: result.message ?? "unknown error",
        });
      } catch {
        // Webhook system unavailable — ignoré
      }

      console.error(`[Scheduler] Mission "${mission.name}" ${result.status}: ${result.message}`);
    } finally {
      markMissionCompleted(mission.id);
      void releaseMissionLease({ missionId: mission.id, runWindowKey: windowKey });
    }
  }
}

/**
 * Start the scheduler polling loop.
 * Returns a cleanup function to stop it.
 */
export function startScheduler(
  trigger: SchedulerTriggerFn,
  isLeader: IsLeaderFn,
): () => void {
  if (intervalId) {
    console.warn("[Scheduler] Already running — skipping duplicate start");
    return () => stopScheduler();
  }

  console.log(`[Scheduler] Started (polling every 60s) [${INSTANCE_ID}]`);

  tick(trigger, isLeader).catch((e) =>
    console.error("[Scheduler] Initial tick error:", e),
  );

  intervalId = setInterval(() => {
    tick(trigger, isLeader).catch((e) =>
      console.error("[Scheduler] Tick error:", e),
    );
  }, POLL_INTERVAL_MS);

  return () => stopScheduler();
}

export function stopScheduler(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    console.log("[Scheduler] Stopped");
  }
}

export { shouldRunNow, parseSchedule };
