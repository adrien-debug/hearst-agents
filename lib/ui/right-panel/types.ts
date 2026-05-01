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
  pendingToolCalls?: number;
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
  /** Timestamp ms — date de création de l'asset. */
  createdAt?: number;
}

/**
 * Suggestion virtuelle proposée à l'utilisateur quand un report catalogué
 * peut être déclenché vu ses apps connectées. Apparaît dans le panneau
 * Assets sans masquer les vrais assets.
 */
export interface RightPanelReportSuggestion {
  /** ID du Spec dans le catalogue (sert de clé d'invocation /run). */
  specId: string;
  title: string;
  description: string;
  /** "ready" : toutes les apps connectées · "partial" : au moins une. */
  status: "ready" | "partial";
  requiredApps: ReadonlyArray<string>;
  missingApps: ReadonlyArray<string>;
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
  /** Reports catalogués activables vu les apps connectées (ready ou partial). */
  reportSuggestions?: RightPanelReportSuggestion[];
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
  /** Thread ID pour traçabilité */
  threadId?: string;
  /** Source plan ID si dérivé d'un plan */
  sourcePlanId?: string;
  /** Source asset ID si dérivé d'un asset */
  sourceAssetId?: string;
  /** Mission ID pour actions pause/resume */
  missionId?: string;
  /** Cible de morphing possible */
  morphTarget?: string | null;
  /** Action primaire affichable */
  primaryAction?: {
    kind: string;
    label: string;
  };
  /** Métadonnées additionnelles pour enrichissement UI */
  body?: string;
  wordCount?: number;
  provider?: string;
  createdAt?: number;
  updatedAt?: number;
}
