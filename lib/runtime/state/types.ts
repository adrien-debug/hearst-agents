/**
 * Runtime State — Persistence types.
 *
 * Canonical types for Supabase-backed run and mission records.
 * These mirror RunRecord / ScheduledMission but are DB-oriented.
 */

export type PersistedRunStatus = "running" | "completed" | "failed";

export interface PersistedRunRecord {
  id: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  input: string;
  surface?: string;
  executionMode?: string;
  agentId?: string;
  backend?: string;
  missionId?: string;
  status: PersistedRunStatus;
  createdAt: number;
  completedAt?: number;
  assets: Array<{ id: string; name: string; type: string }>;
}

export type PersistedMissionRunStatus = "success" | "failed" | "blocked";

export interface PersistedScheduledMission {
  id: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  name: string;
  input: string;
  schedule: string;
  enabled: boolean;
  createdAt: number;
  lastRunAt?: number;
  lastRunId?: string;
  lastRunStatus?: PersistedMissionRunStatus;
  lastError?: string;
}
