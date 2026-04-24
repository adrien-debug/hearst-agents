/**
 * System Configuration — Feature flags for controlled convergence.
 */

export const SYSTEM_CONFIG = {
  /** Use the v2 orchestrator (RunEngine + SSE) for /api/orchestrate. */
  useV2Orchestrator: true,

  /** Use the v2 in-memory run store for run history / right panel. */
  useV2Runs: true,

  /**
   * Require tenantId + workspaceId for all v2 runtime operations.
   */
  requireTenantScopeForV2: true,

  /**
   * Backend V2 (Session Manager + Backend Selector) configuration.
   */
  orchestratorV2: {
    /** Enable the new Backend V2 pipeline */
    enabled: true,

    /** Percentage of users to route to V2 (0-100) */
    rolloutPercentage: 100,

    /** Enable automatic backend selection */
    autoSelectBackend: false,

    /** Default backend when auto-selection is disabled */
    defaultBackend: "openai_assistants" as const,

    /** Enable handoff between backends */
    enableHandoff: true,

    /** Max sessions per user */
    maxSessionsPerUser: 10,

    /** Session timeout in minutes */
    sessionTimeoutMinutes: 30,
  },
} as const;
