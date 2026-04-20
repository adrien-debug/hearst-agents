/**
 * Run History — Types.
 *
 * A RunRecord is the in-memory representation of a v2 orchestrator run,
 * aggregating metadata, events, and assets for the unified timeline.
 */

import type { RunEvent } from "../../events/types";

export type RunStatus = "running" | "completed" | "failed";

export interface RunAssetRef {
  id: string;
  name: string;
  type: string;
  _filePath?: string;
  _fileName?: string;
  _mimeType?: string;
  _sizeBytes?: number;
}

export interface RunRecord {
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

  createdAt: number;
  completedAt?: number;
  status: RunStatus;

  events: RunEvent[];
  assets: RunAssetRef[];
}
