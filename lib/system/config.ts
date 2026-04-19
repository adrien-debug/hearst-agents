/**
 * System Configuration — Feature flags for controlled convergence.
 *
 * These flags route traffic between v1 (legacy) and v2 (RunEngine) pipelines.
 * Flip to false to fall back to legacy behavior without code changes.
 */

export const SYSTEM_CONFIG = {
  /** Use the v2 orchestrator (RunEngine + SSE) for /api/orchestrate. */
  useV2Orchestrator: true,

  /** Use the v2 in-memory run store for run history / right panel. */
  useV2Runs: true,

  /** Allow legacy /api/chat pipeline to remain callable. */
  enableLegacyFallback: true,

  /**
   * Require tenantId + workspaceId for all v2 runtime operations.
   * Set to false during development to allow fallback with warnings.
   */
  requireTenantScopeForV2: false,
} as const;
