/**
 * Scheduled Mission types — recurring automations executed via the orchestrator.
 *
 * Server-side scheduled missions that run through the orchestrator.
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
