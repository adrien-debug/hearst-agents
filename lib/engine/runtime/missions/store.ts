/**
 * Scheduled Mission Store — in-memory store for scheduled missions.
 * Kept as fallback and for scheduler hot-path reads.
 * Canonical runtime state is persisted via lib/engine/runtime/state/adapter.ts.
 */

import type { ScheduledMission } from "./types";

const missions: Map<string, ScheduledMission> = new Map();

export function addMission(mission: ScheduledMission): void {
  missions.set(mission.id, mission);
}

export function getMission(id: string): ScheduledMission | undefined {
  return missions.get(id);
}

export function getAllMissions(): ScheduledMission[] {
  return Array.from(missions.values());
}

export function getEnabledMissions(): ScheduledMission[] {
  return Array.from(missions.values()).filter((m) => m.enabled);
}

export function updateMissionLastRun(id: string, runId: string): void {
  const m = missions.get(id);
  if (m) {
    m.lastRunAt = Date.now();
    m.lastRunId = runId;
  }
}

export function disableMission(id: string): void {
  const m = missions.get(id);
  if (m) m.enabled = false;
}

/** Drop a single mission from the in-memory store. Called by DELETE API. */
export function evictMission(id: string): void {
  missions.delete(id);
}

/** Wipe every mission from the in-memory store. Server-only cleanup. */
export function clearAllMissions(): void {
  missions.clear();
}
