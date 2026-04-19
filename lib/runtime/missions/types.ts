/**
 * Scheduled Mission types — recurring automations executed via the orchestrator.
 *
 * Distinct from app/lib/missions (client-side, user-triggered, legacy pipeline).
 * These are server-side scheduled missions that run through the v2 orchestrator.
 */

export interface ScheduledMission {
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
}

export interface ScheduledMissionRun {
  missionId: string;
  runId: string;
  triggeredAt: number;
}
