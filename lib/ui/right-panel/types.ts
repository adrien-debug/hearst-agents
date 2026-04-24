/**
 * Right Panel — View model types.
 *
 * Aggregated data shape consumed by the Right Panel UI.
 * Built from in-memory run store, mission store, and asset refs.
 */

export interface RightPanelCurrentRun {
  id: string;
  status: string;
  executionMode?: string;
  agentId?: string;
  backend?: string;
}

export interface RightPanelRun {
  id: string;
  input: string;
  status: string;
  executionMode?: string;
  agentId?: string;
  createdAt: number;
  completedAt?: number;
}

export interface RightPanelAsset {
  id: string;
  name: string;
  type: string;
  runId: string;
}

export interface RightPanelMission {
  id: string;
  name: string;
  input: string;
  schedule: string;
  enabled: boolean;
  lastRunAt?: number;
  lastRunId?: string;
  opsStatus?: "idle" | "running" | "success" | "failed" | "blocked";
  lastError?: string;
}

export interface RightPanelSchedulerSummary {
  isLeader: boolean;
  mode: string;
}

export interface RightPanelMissionOpsSummary {
  running: number;
  failed: number;
  blocked: number;
}

export interface RightPanelConnectorHealth {
  healthy: number;
  degraded: number;
  disconnected: number;
}

export interface RightPanelData {
  currentRun?: RightPanelCurrentRun;
  recentRuns: RightPanelRun[];
  assets: RightPanelAsset[];
  missions: RightPanelMission[];
  connectorHealth?: RightPanelConnectorHealth;
  scheduler?: RightPanelSchedulerSummary;
  missionOpsSummary?: RightPanelMissionOpsSummary;
  /** Canonique: objet focal principal (report, brief, message, mission, etc.) */
  focalObject?: FocalObjectView | Record<string, unknown>;
  /** Objets secondaires pour navigation rapide */
  secondaryObjects?: (FocalObjectView | Record<string, unknown>)[];
}

/** Subset léger du focal object pour affichage dans le RightPanel */
export interface FocalObjectView {
  objectType: string;
  id: string;
  title: string;
  status: string;
  summary?: string;
  sections?: Array<{ heading?: string; body: string }>;
  primaryAction?: {
    kind: string;
    label: string;
  };
}
