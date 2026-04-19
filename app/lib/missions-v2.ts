/**
 * Canonical frontend mission client — talks only to /api/v2/missions*.
 *
 * All mission UI surfaces should use these helpers instead of
 * the legacy app/lib/missions/* client engine.
 */

import type { MissionOpsRecord } from "@/lib/runtime/missions/ops-types";

/** Surface type — canonical re-export for UI components. */
export type Surface = "home" | "inbox" | "calendar" | "files" | "tasks" | "apps";

// ── Types ────────────────────────────────────────────────

export interface ScheduledMissionSummary {
  id: string;
  name: string;
  input: string;
  schedule: string;
  enabled: boolean;
  tenantId: string;
  workspaceId: string;
  userId: string;
  createdAt: number;
  lastRunAt?: number;
  lastRunId?: string;
  lastRunStatus?: "success" | "failed" | "blocked";
  lastError?: string;
}

// ── Fetch missions ───────────────────────────────────────

export async function fetchMissions(): Promise<ScheduledMissionSummary[]> {
  const res = await fetch("/api/v2/missions");
  if (!res.ok) return [];
  const data = await res.json();
  return data.missions ?? [];
}

// ── Create mission ───────────────────────────────────────

export async function createMission(input: {
  name?: string;
  input: string;
  schedule: string;
  enabled?: boolean;
}): Promise<{ ok: boolean; mission?: ScheduledMissionSummary }> {
  const res = await fetch("/api/v2/missions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: true, mission: data.mission };
}

// ── Toggle enable/disable ────────────────────────────────

export async function toggleMission(
  missionId: string,
  enabled: boolean,
): Promise<boolean> {
  const res = await fetch("/api/v2/missions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: missionId, enabled }),
  });
  return res.ok;
}

// ── Run now ──────────────────────────────────────────────

export async function runMissionNow(
  missionId: string,
): Promise<{ ok: boolean; runId?: string }> {
  const res = await fetch(`/api/v2/missions/${missionId}/run`, {
    method: "POST",
  });
  if (!res.ok) return { ok: false };
  const data = await res.json();
  return { ok: true, runId: data.runId };
}

// ── Fetch mission ops ────────────────────────────────────

export async function fetchMissionOps(): Promise<MissionOpsRecord[]> {
  const res = await fetch("/api/v2/missions/ops");
  if (!res.ok) return [];
  const data = await res.json();
  return data.missions ?? [];
}
