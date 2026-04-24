/**
 * Mission Engine V2 — Activates and manages recurring/monitoring missions.
 *
 * A mission is born from an approved ExecutionPlan of type "mission" or "monitoring".
 * It lives beyond a single thread conversation and executes on schedule or condition.
 *
 * Lifecycle:
 * - chat intent → planner → ExecutionPlan(type=mission) → approval → MissionDefinition
 * - MissionDefinition: draft → active → paused/completed
 * - Active missions: scheduler checks getDueMissions() and runs them
 *
 * This module does NOT contain scheduling logic (that's in lib/runtime/missions/scheduler.ts).
 * It provides the mission lifecycle management layer above it.
 */

import type { MissionDefinition, MissionMode } from "./types";
import { getPlan, saveMission, getMission, getActiveMissions, getDueMissions } from "./store";
import { logPlanEvent } from "./debug";

// ── Mission creation from plan ──────────────────────────────

let missionCounter = 0;

export function activateMissionFromPlan(
  planId: string,
  overrides?: {
    schedule?: string;
    condition?: string;
    mode?: MissionMode;
  },
): MissionDefinition | null {
  const plan = getPlan(planId);
  if (!plan) {
    logPlanEvent("mission_activation_failed", { planId, reason: "plan_not_found" });
    return null;
  }

  if (plan.type !== "mission" && plan.type !== "monitoring") {
    logPlanEvent("mission_activation_failed", { planId, reason: "wrong_plan_type", type: plan.type });
    return null;
  }

  const mode: MissionMode = overrides?.mode ?? (plan.type === "monitoring" ? "monitoring" : "recurring");
  const now = Date.now();

  const mission: MissionDefinition = {
    id: `mission_${now}_${++missionCounter}`,
    threadId: plan.threadId,
    userId: plan.userId,
    tenantId: plan.tenantId,
    workspaceId: plan.workspaceId,
    sourcePlanId: planId,
    mode,
    naturalLanguageRule: plan.intent,
    schedule: overrides?.schedule,
    condition: overrides?.condition,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };

  saveMission(mission);
  logPlanEvent("mission_created", { missionId: mission.id, planId, mode });

  return mission;
}

// ── Lifecycle transitions ───────────────────────────────────

export function startMission(missionId: string): MissionDefinition | null {
  const mission = getMission(missionId);
  if (!mission || mission.status !== "draft") return null;

  mission.status = "active";
  mission.updatedAt = Date.now();

  if (mission.schedule) {
    mission.nextRunAt = computeNextRun(mission.schedule, Date.now());
  }

  saveMission(mission);
  logPlanEvent("mission_started", { missionId, nextRunAt: mission.nextRunAt });

  return mission;
}

export function pauseMission(missionId: string): MissionDefinition | null {
  const mission = getMission(missionId);
  if (!mission || mission.status !== "active") return null;

  mission.status = "paused";
  mission.updatedAt = Date.now();
  saveMission(mission);
  logPlanEvent("mission_paused", { missionId });

  return mission;
}

export function resumeMission(missionId: string): MissionDefinition | null {
  const mission = getMission(missionId);
  if (!mission || mission.status !== "paused") return null;

  mission.status = "active";
  mission.updatedAt = Date.now();

  if (mission.schedule) {
    mission.nextRunAt = computeNextRun(mission.schedule, Date.now());
  }

  saveMission(mission);
  logPlanEvent("mission_resumed", { missionId });

  return mission;
}

export function completeMission(missionId: string): MissionDefinition | null {
  const mission = getMission(missionId);
  if (!mission) return null;

  mission.status = "completed";
  mission.nextRunAt = undefined;
  mission.updatedAt = Date.now();
  saveMission(mission);
  logPlanEvent("mission_completed", { missionId });

  return mission;
}

export function recordMissionRun(missionId: string): MissionDefinition | null {
  const mission = getMission(missionId);
  if (!mission || mission.status !== "active") return null;

  mission.lastRunAt = Date.now();
  mission.updatedAt = Date.now();

  if (mission.schedule) {
    mission.nextRunAt = computeNextRun(mission.schedule, Date.now());
  }

  saveMission(mission);
  logPlanEvent("mission_run_recorded", { missionId, nextRunAt: mission.nextRunAt });

  return mission;
}

// ── Query helpers ───────────────────────────────────────────

export { getActiveMissions, getDueMissions };

// ── Schedule parsing (basic — production should use cron) ───

const SCHEDULE_INTERVALS: Record<string, number> = {
  "every minute": 60 * 1000,
  "hourly": 60 * 60 * 1000,
  "daily": 24 * 60 * 60 * 1000,
  "weekly": 7 * 24 * 60 * 60 * 1000,
  "chaque heure": 60 * 60 * 1000,
  "tous les jours": 24 * 60 * 60 * 1000,
  "chaque jour": 24 * 60 * 60 * 1000,
  "chaque semaine": 7 * 24 * 60 * 60 * 1000,
  "toutes les heures": 60 * 60 * 1000,
};

function computeNextRun(schedule: string, from: number): number {
  const lower = schedule.toLowerCase().trim();
  const interval = SCHEDULE_INTERVALS[lower];
  if (interval) return from + interval;

  // Fallback: daily
  return from + 24 * 60 * 60 * 1000;
}
