/**
 * Run Store — In-memory store for RunRecords.
 * Kept for live event accumulation during a run and as fallback if Supabase is unavailable.
 * Canonical runtime state is persisted via lib/engine/runtime/state/adapter.ts.
 */

import type { RunRecord } from "./types";

const MAX_RUNS = 500;

const runs: Map<string, RunRecord> = new Map();

export function addRun(run: RunRecord): void {
  if (runs.size >= MAX_RUNS) {
    const oldest = runs.keys().next().value;
    if (oldest) runs.delete(oldest);
  }
  runs.set(run.id, run);
}

export function getRunById(id: string): RunRecord | undefined {
  return runs.get(id);
}

export function getAllRuns(limit = 50): RunRecord[] {
  const all = Array.from(runs.values());
  all.sort((a, b) => b.createdAt - a.createdAt);
  return all.slice(0, limit);
}

export function getRunsByUserId(userId: string, limit = 50): RunRecord[] {
  return Array.from(runs.values())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
}

/** Wipe every run from the in-memory store. Server-only cleanup. */
export function clearAllRuns(): void {
  runs.clear();
}
