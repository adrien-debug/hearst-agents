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
} as const;
