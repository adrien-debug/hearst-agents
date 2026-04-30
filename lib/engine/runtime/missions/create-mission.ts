/**
 * Scheduled Mission factory.
 * Tenant scope is required — missions cannot be created without it.
 */

import { randomUUID } from "crypto";
import type { ScheduledMission } from "./types";

export interface CreateScheduledMissionInput {
  name: string;
  input: string;
  schedule: string;
  tenantId: string;
  workspaceId: string;
  userId: string;
  /** Workflow graph optionnel (Builder C3). */
  workflowGraph?: unknown;
}

export function createScheduledMission(
  input: CreateScheduledMissionInput,
): ScheduledMission {
  return {
    id: randomUUID(),
    name: input.name,
    input: input.input,
    schedule: input.schedule,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    userId: input.userId,
    enabled: true,
    createdAt: Date.now(),
    workflowGraph: input.workflowGraph,
  };
}
