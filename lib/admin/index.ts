/**
 * Admin API — Architecture Finale
 *
 * Centralized admin operations.
 * Path: lib/admin/index.ts
 */

export {
  getSystemSettings,
  updateSystemSetting,
  deleteSystemSetting,
  type SystemSetting,
} from "./settings";

export {
  checkPermission,
  getUserRole,
  assignRole,
  type Role,
  type PermissionCheck,
} from "./permissions";

export {
  listConnectors,
  updateConnectorStatus,
  configureConnector,
  type ConnectorConfig,
} from "./connectors";

export {
  getSystemHealth,
  checkDatabaseHealth,
  type HealthStatus,
} from "./health";

export {
  logAdminAction,
  getAuditLogs,
  exportAuditLogs,
  type AuditLog,
} from "./audit";
