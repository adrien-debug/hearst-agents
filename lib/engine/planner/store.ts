/**
 * Planner Store — In-memory persistence for ExecutionPlans and MissionDefinitions.
 *
 * Dev implementation. Production: swap with Supabase/DB adapter
 * using the same interface.
 */

import type { ExecutionPlan, MissionDefinition } from "./types";

// ── Interfaces (for future DB adapter) ──────────────────────

export interface PlanStore {
  save(plan: ExecutionPlan): void;
  get(planId: string): ExecutionPlan | null;
  getForThread(threadId: string): ExecutionPlan[];
  getActive(): ExecutionPlan[];
  delete(planId: string): void;
}

export interface MissionStore {
  save(mission: MissionDefinition): void;
  get(missionId: string): MissionDefinition | null;
  getForThread(threadId: string): MissionDefinition[];
  getActive(): MissionDefinition[];
  getDue(now: number): MissionDefinition[];
  delete(missionId: string): void;
}

// ── In-memory plan store ────────────────────────────────────

const plans = new Map<string, ExecutionPlan>();
const plansByThread = new Map<string, Set<string>>();

export function savePlan(plan: ExecutionPlan): void {
  plans.set(plan.id, plan);
  let threadSet = plansByThread.get(plan.threadId);
  if (!threadSet) {
    threadSet = new Set();
    plansByThread.set(plan.threadId, threadSet);
  }
  threadSet.add(plan.id);
}

export function getPlan(planId: string): ExecutionPlan | null {
  return plans.get(planId) ?? null;
}

export function getPlansForThread(threadId: string): ExecutionPlan[] {
  const ids = plansByThread.get(threadId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => plans.get(id))
    .filter((p): p is ExecutionPlan => p !== undefined);
}

export function getAllPlans(): ExecutionPlan[] {
  return Array.from(plans.values());
}

export function getActivePlans(): ExecutionPlan[] {
  return Array.from(plans.values()).filter(
    (p) => p.status === "executing" || p.status === "awaiting_approval" || p.status === "ready",
  );
}

export function deletePlan(planId: string): void {
  const plan = plans.get(planId);
  if (plan) {
    plansByThread.get(plan.threadId)?.delete(planId);
    plans.delete(planId);
  }
}

// ── In-memory mission store ─────────────────────────────────

const missions = new Map<string, MissionDefinition>();
const missionsByThread = new Map<string, Set<string>>();

export function saveMission(mission: MissionDefinition): void {
  missions.set(mission.id, mission);
  let threadSet = missionsByThread.get(mission.threadId);
  if (!threadSet) {
    threadSet = new Set();
    missionsByThread.set(mission.threadId, threadSet);
  }
  threadSet.add(mission.id);
}

export function getMission(missionId: string): MissionDefinition | null {
  return missions.get(missionId) ?? null;
}

export function getMissionsForThread(threadId: string): MissionDefinition[] {
  const ids = missionsByThread.get(threadId);
  if (!ids) return [];
  return Array.from(ids)
    .map((id) => missions.get(id))
    .filter((m): m is MissionDefinition => m !== undefined);
}

export function getActiveMissions(): MissionDefinition[] {
  return Array.from(missions.values()).filter((m) => m.status === "active");
}

export function getDueMissions(now: number): MissionDefinition[] {
  return Array.from(missions.values()).filter(
    (m) => m.status === "active" && m.nextRunAt !== undefined && m.nextRunAt <= now,
  );
}

export function deleteMission(missionId: string): void {
  const mission = missions.get(missionId);
  if (mission) {
    missionsByThread.get(mission.threadId)?.delete(missionId);
    missions.delete(missionId);
  }
}

/** Wipe every plan and planner-mission from memory. Server-only cleanup. */
export function clearAllPlannerStores(): void {
  plans.clear();
  plansByThread.clear();
  missions.clear();
  missionsByThread.clear();
}
