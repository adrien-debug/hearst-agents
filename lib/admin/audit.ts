/**
 * Admin Audit API — Architecture Finale
 *
 * Audit logging for admin actions and system events.
 * Path: lib/admin/audit.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type AuditAction =
  | "settings.create"
  | "settings.update"
  | "settings.delete"
  | "permissions.grant"
  | "permissions.revoke"
  | "connector.enable"
  | "connector.disable"
  | "connector.configure"
  | "user.create"
  | "user.update"
  | "user.delete"
  | "run.create"
  | "run.execute"
  | "asset.create"
  | "asset.delete"
  | "asset.download"
  | "system.health_check"
  | "auth.login"
  | "auth.logout"
  | "auth.failed";

export type AuditSeverity = "info" | "warning" | "error" | "critical";

export interface AuditLog {
  id: string;
  timestamp: string;
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details: Record<string, unknown>;
  severity: AuditSeverity;
  ip?: string;
  userAgent?: string;
  tenantId?: string;
  success: boolean;
  errorMessage?: string;
}

export interface CreateAuditLogInput {
  userId: string;
  action: AuditAction;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  severity?: AuditSeverity;
  ip?: string;
  userAgent?: string;
  tenantId?: string;
  success?: boolean;
  errorMessage?: string;
}

export interface AuditQueryFilters {
  userId?: string;
  action?: AuditAction;
  resource?: string;
  tenantId?: string;
  severity?: AuditSeverity;
  startDate?: string;
  endDate?: string;
  success?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Log an admin action
 */
export async function logAdminAction(
  db: SupabaseClient,
  input: CreateAuditLogInput
): Promise<AuditLog> {
  const { data, error } = await db
    .from("audit_logs")
    .insert({
      user_id: input.userId,
      action: input.action,
      resource: input.resource,
      resource_id: input.resourceId,
      details: input.details || {},
      severity: input.severity || "info",
      ip_address: input.ip,
      user_agent: input.userAgent,
      tenant_id: input.tenantId,
      success: input.success ?? true,
      error_message: input.errorMessage,
    })
    .select()
    .single();

  if (error) {
    // Log to console as fallback (audit logging should not break the app)
    console.error("[Admin/Audit] Failed to log action:", error, input);
    throw new Error(`Failed to log action: ${error.message}`);
  }

  return parseAuditRow(data);
}

/**
 * Get audit logs with filtering
 */
export async function getAuditLogs(
  db: SupabaseClient,
  filters: AuditQueryFilters = {}
): Promise<{ logs: AuditLog[]; total: number }> {
  let query = db
    .from("audit_logs")
    .select("*", { count: "exact" });

  // Apply filters
  if (filters.userId) {
    query = query.eq("user_id", filters.userId);
  }
  if (filters.action) {
    query = query.eq("action", filters.action);
  }
  if (filters.resource) {
    query = query.eq("resource", filters.resource);
  }
  if (filters.tenantId) {
    query = query.eq("tenant_id", filters.tenantId);
  }
  if (filters.severity) {
    query = query.eq("severity", filters.severity);
  }
  if (filters.success !== undefined) {
    query = query.eq("success", filters.success);
  }
  if (filters.startDate) {
    query = query.gte("created_at", filters.startDate);
  }
  if (filters.endDate) {
    query = query.lte("created_at", filters.endDate);
  }

  // Pagination
  const limit = filters.limit ?? 100;
  const offset = filters.offset ?? 0;
  query = query
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    console.error("[Admin/Audit] Failed to fetch logs:", error);
    throw new Error(`Failed to fetch logs: ${error.message}`);
  }

  return {
    logs: (data || []).map(parseAuditRow),
    total: count || 0,
  };
}

/**
 * Get a single audit log by ID
 */
export async function getAuditLog(
  db: SupabaseClient,
  logId: string
): Promise<AuditLog | null> {
  const { data, error } = await db
    .from("audit_logs")
    .select("*")
    .eq("id", logId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    console.error("[Admin/Audit] Failed to fetch log:", error);
    throw new Error(`Failed to fetch log: ${error.message}`);
  }

  return data ? parseAuditRow(data) : null;
}

/**
 * Export audit logs to CSV format
 */
export async function exportAuditLogs(
  db: SupabaseClient,
  startDate: string,
  endDate: string,
  tenantId?: string
): Promise<string> {
  const { logs } = await getAuditLogs(db, {
    startDate,
    endDate,
    tenantId,
    limit: 10000, // Max export size
  });

  const headers = [
    "timestamp",
    "userId",
    "action",
    "resource",
    "resourceId",
    "severity",
    "success",
    "ip",
    "tenantId",
    "details",
  ];

  const rows = logs.map((log) => [
    log.timestamp,
    log.userId,
    log.action,
    log.resource,
    log.resourceId || "",
    log.severity,
    log.success ? "true" : "false",
    log.ip || "",
    log.tenantId || "",
    JSON.stringify(log.details),
  ]);

  const escapeCsv = (value: string) => {
    if (value.includes(",") || value.includes('"') || value.includes("\n")) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  const csv = [
    headers.join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ].join("\n");

  return csv;
}

/**
 * Get audit statistics
 */
export async function getAuditStats(
  db: SupabaseClient,
  startDate: string,
  endDate: string,
  tenantId?: string
): Promise<{
  totalActions: number;
  byAction: Record<string, number>;
  bySeverity: Record<AuditSeverity, number>;
  byUser: Record<string, number>;
  successRate: number;
}> {
  let query = db
    .from("audit_logs")
    .select("action, severity, user_id, success")
    .gte("created_at", startDate)
    .lte("created_at", endDate);

  if (tenantId) {
    query = query.eq("tenant_id", tenantId);
  }

  const { data, error } = await query;

  if (error) {
    console.error("[Admin/Audit] Failed to fetch stats:", error);
    throw new Error(`Failed to fetch stats: ${error.message}`);
  }

  const stats = {
    totalActions: 0,
    byAction: {} as Record<string, number>,
    bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
    byUser: {} as Record<string, number>,
    successCount: 0,
    successRate: 100,
  };

  for (const row of data || []) {
    stats.totalActions++;

    const action = row.action as string;
    stats.byAction[action] = (stats.byAction[action] || 0) + 1;

    const severity = row.severity as AuditSeverity;
    if (severity in stats.bySeverity) {
      stats.bySeverity[severity]++;
    }

    const userId = row.user_id as string;
    stats.byUser[userId] = (stats.byUser[userId] || 0) + 1;

    if (row.success) {
      stats.successCount++;
    }
  }

  stats.successRate =
    stats.totalActions > 0
      ? Math.round((stats.successCount / stats.totalActions) * 100)
      : 100;

  return {
    totalActions: stats.totalActions,
    byAction: stats.byAction,
    bySeverity: stats.bySeverity,
    byUser: stats.byUser,
    successRate: stats.successRate,
  };
}

/**
 * Create a convenience logger with context
 */
export function createAuditLogger(
  db: SupabaseClient,
  context: {
    userId: string;
    tenantId?: string;
    ip?: string;
    userAgent?: string;
  }
) {
  return {
    log: (
      action: AuditAction,
      resource: string,
      details?: Record<string, unknown>,
      options?: { severity?: AuditSeverity; success?: boolean; errorMessage?: string }
    ) =>
      logAdminAction(db, {
        userId: context.userId,
        action,
        resource,
        details,
        severity: options?.severity,
        ip: context.ip,
        userAgent: context.userAgent,
        tenantId: context.tenantId,
        success: options?.success,
        errorMessage: options?.errorMessage,
      }),
  };
}

/**
 * Parse a database row into AuditLog interface
 */
function parseAuditRow(row: Record<string, unknown>): AuditLog {
  return {
    id: row.id as string,
    timestamp: row.created_at as string,
    userId: row.user_id as string,
    action: row.action as AuditAction,
    resource: row.resource as string,
    resourceId: row.resource_id as string | undefined,
    details: (row.details as Record<string, unknown>) || {},
    severity: (row.severity as AuditSeverity) || "info",
    ip: row.ip_address as string | undefined,
    userAgent: row.user_agent as string | undefined,
    tenantId: row.tenant_id as string | undefined,
    success: row.success as boolean,
    errorMessage: row.error_message as string | undefined,
  };
}
