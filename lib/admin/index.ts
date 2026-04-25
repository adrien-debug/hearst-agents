/**
 * Admin API — Architecture Finale
 *
 * Centralized admin operations.
 * Path: lib/admin/index.ts
 */

export {
  getSystemSettings,
  getSystemSetting,
  getEffectiveSetting,
  createSystemSetting,
  updateSystemSetting,
  upsertSystemSetting,
  deleteSystemSetting,
  getFeatureFlags,
  isFeatureEnabled,
  type SystemSetting,
  type SettingCategory,
  type CreateSettingInput,
  type UpdateSettingInput,
} from "./settings";

export {
  checkPermission,
  hasPermission,
  getUserRole,
  assignRole,
  removeRole,
  hasHigherOrEqualRole,
  getRolePermissions,
  listUsersWithRole,
  requirePermission,
  PermissionDeniedError,
  type Role,
  type PermissionCheck,
  type UserRoleAssignment,
} from "./permissions";

export {
  listConnectors,
  listConnectorInstances,
  updateConnectorStatus,
  configureConnector,
  createConnectorInstance,
  deleteConnectorInstance,
  testConnectorConnection,
  type ConnectorConfig,
  type ConnectorInstance,
  type UpdateConnectorStatusInput,
  type ConfigureConnectorInput,
} from "./connectors";

export {
  getSystemHealth,
  checkDatabaseHealth,
  checkStorageHealth,
  getComponentHealth,
  livenessProbe,
  readinessProbe,
  type HealthStatus,
  type ComponentHealth,
} from "./health";

export {
  logAdminAction,
  getAuditLogs,
  getAuditLog,
  exportAuditLogs,
  getAuditStats,
  createAuditLogger,
  type AuditLog,
  type AuditAction,
  type AuditSeverity,
  type CreateAuditLogInput,
  type AuditQueryFilters,
} from "./audit";
