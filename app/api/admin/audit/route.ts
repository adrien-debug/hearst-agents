/**
 * GET /api/admin/audit — list audit logs (RBAC: admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isError } from "../_helpers";
import { getAuditLogs, type AuditQueryFilters } from "@/lib/admin/audit";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("GET /api/admin/audit", { resource: "settings", action: "admin" });
  if (isError(guard)) return guard;

  const { db } = guard;
  const url = new URL(req.url);

  const filters: AuditQueryFilters = {};
  const action = url.searchParams.get("action");
  const userId = url.searchParams.get("userId");
  const severity = url.searchParams.get("severity");
  const limit = url.searchParams.get("limit");
  const offset = url.searchParams.get("offset");

  if (action) filters.action = action as AuditQueryFilters["action"];
  if (userId) filters.userId = userId;
  if (severity) filters.severity = severity as AuditQueryFilters["severity"];
  if (limit) filters.limit = parseInt(limit, 10);
  if (offset) filters.offset = parseInt(offset, 10);

  try {
    const result = await getAuditLogs(db, filters);
    return NextResponse.json({ logs: result.logs, total: result.total, filters });
  } catch (e) {
    console.error("[Admin API] GET /audit error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
