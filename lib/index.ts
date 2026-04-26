/**
 * HEARST OS — Master Barrel Export
 *
 * Architecture Finale: single entry point for library imports.
 * Usage: import { type Asset, type RunRecord } from "@/lib"
 *
 * For deeper access, import from submodules directly:
 *   import { generatePdfArtifact } from "@/lib/engine/runtime/assets/generators"
 */

// ── Core Types ────────────────────────────────────────────
export * from "./core/types";

// ── Platform: Auth ────────────────────────────────────────
export { authOptions } from "./platform/auth";
export {
  getTokens,
  getTokenMeta,
  saveTokens,
  isTokenExpired,
  type StoredTokens,
  type TokenMeta,
} from "./platform/auth/tokens";
export {
  getHearstSession,
  getCurrentUserId,
  requireAuth,
} from "./platform/auth/session";

// ── Platform: Settings ────────────────────────────────────
export {
  getSettingValue,
  setSettingValue,
  getFeatureFlag,
  setFeatureFlag,
  invalidateSettingsCache,
} from "./platform/settings";

// ── Platform: DB ──────────────────────────────────────────
export { getServerSupabase, requireServerSupabase } from "./platform/db";

// ── Admin ─────────────────────────────────────────────────
export { getSystemSettings, upsertSystemSetting } from "./admin/settings";
export { checkPermission, type PermissionCheck } from "./admin/permissions";
export { getSystemHealth, type HealthStatus } from "./admin/health";
export { logAdminAction, getAuditLogs } from "./admin/audit";
export {
  listConnectors,
  listConnectorInstances,
  testConnectorConnection,
} from "./admin/connectors";

// ── Providers ─────────────────────────────────────────────
export { resolveProvider, resolveFallback } from "./providers/resolver";
export type { ProviderId } from "./providers/types";

// ── Connectors ────────────────────────────────────────────
export { gmailConnector, calendarConnector, driveConnector } from "./connectors";
export { isNangoEnabled } from "./connectors/nango/client";

// ── Assets (thread-scoped) ────────────────────────────────
export {
  storeAsset,
  storeAction,
  getAssetsForThread,
  getActionsForThread,
} from "./assets/types";

// ── Storage ───────────────────────────────────────────────
export {
  createStorageProvider,
  getGlobalStorage,
  initGlobalStorage,
} from "./engine/runtime/assets/storage";

// ── Cache ─────────────────────────────────────────────────
export { RedisCache, getGlobalRedisCache } from "./engine/runtime/assets/cache";
export { MemoryCache, globalMemoryCache } from "./engine/runtime/assets/cache/memory";

// ── Generators ────────────────────────────────────────────
export { generatePdfArtifact } from "./engine/runtime/assets/generators/pdf";
export { generateSpreadsheetArtifact } from "./engine/runtime/assets/generators/spreadsheet";

// ── Cleanup ───────────────────────────────────────────────
export { CleanupScheduler } from "./engine/runtime/assets/cleanup/scheduler";
export { getCleanupScheduler } from "./engine/runtime/assets/cleanup/boot";

// ── Planner ───────────────────────────────────────────────
export { executeIntent, approveAndResume } from "./engine/planner/pipeline";

// ── LLM ───────────────────────────────────────────────────
export { chatWithProfile } from "./llm/router";

// ── Tools ─────────────────────────────────────────────────
export { searchWeb } from "./tools/handlers/web-search";
