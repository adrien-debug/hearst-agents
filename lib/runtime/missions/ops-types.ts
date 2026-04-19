/**
 * Scheduler & Mission Operations types — runtime observability shapes.
 */

export type SchedulerMode = "leader" | "standby" | "local_fallback";

export interface SchedulerStatus {
  instanceId: string;
  isLeader: boolean;
  leaderInstanceId?: string | null;
  leadershipExpiresAt?: string | null;
  heartbeatAt?: number;
  mode: SchedulerMode;
}

export type MissionExecutionStatus =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "blocked";

export interface MissionOpsRecord {
  missionId: string;
  name: string;
  tenantId: string;
  workspaceId: string;
  enabled: boolean;

  status: MissionExecutionStatus;
  lastRunAt?: number;
  lastRunId?: string;
  lastRunStatus?: "success" | "failed" | "blocked";
  lastError?: string;

  runningSince?: number;
}
