/**
 * Admin Audit API — Architecture Finale
 *
 * Audit logging for admin actions and system events.
 * Path: lib/admin/audit.ts
 */

import type { SupabaseClient } from "@supabase/supabase-js";

type AuditAction =
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

type AuditSeverity = "info" | "warning" | "error" | "critical";

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
