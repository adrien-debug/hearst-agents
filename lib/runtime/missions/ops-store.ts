/**
 * Mission Ops Store — in-memory runtime status for observability.
 *
 * Tracks current execution state of each mission so APIs and UI
 * can show running / success / failed / blocked without polling the DB.
 * Does not replace persistence — this is ephemeral per-process state.
 */

import type { MissionExecutionStatus, MissionOpsRecord } from "./ops-types";

interface OpsEntry {
  status: MissionExecutionStatus;
  lastRunStatus?: "success" | "failed" | "blocked";
  lastRunAt?: number;
  lastRunId?: string;
  lastError?: string;
  runningSince?: number;
}

const store = new Map<string, OpsEntry>();

export function setMissionRunning(missionId: string): void {
  const existing = store.get(missionId);
  store.set(missionId, {
    ...existing,
    status: "running",
    runningSince: Date.now(),
    lastError: existing?.lastError,
    lastRunStatus: existing?.lastRunStatus,
    lastRunAt: existing?.lastRunAt,
    lastRunId: existing?.lastRunId,
  });
}

export function setMissionResult(
  missionId: string,
  result: { status: "success" | "failed" | "blocked"; runId?: string; error?: string },
): void {
  store.set(missionId, {
    status: result.status === "success" ? "success" : result.status,
    lastRunStatus: result.status,
    lastRunAt: Date.now(),
    lastRunId: result.runId,
    lastError: result.error,
    runningSince: undefined,
  });
}

export function getMissionOps(missionId: string): OpsEntry | undefined {
  return store.get(missionId);
}

export function getAllMissionOps(): Map<string, OpsEntry> {
  return store;
}
