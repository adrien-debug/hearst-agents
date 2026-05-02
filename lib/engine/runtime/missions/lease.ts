/**
 * Mission Execution Lease — in-memory guard against overlapping runs.
 *
 * Tracks which missions are currently executing so the scheduler
 * can skip re-triggering a mission that hasn't finished yet.
 * Single-process only — sufficient for the current deployment model.
 */

interface LeaseEntry {
  startedAt: number;
}

const running = new Map<string, LeaseEntry>();

export function isMissionRunning(missionId: string): boolean {
  return running.has(missionId);
}

export function markMissionRunning(missionId: string): void {
  running.set(missionId, { startedAt: Date.now() });
}

export function markMissionCompleted(missionId: string): void {
  running.delete(missionId);
}
