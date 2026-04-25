/**
 * GET /api/admin/health — system health check (RBAC: read settings)
 */

import { NextResponse } from "next/server";
import { requireAdmin, isError } from "../_helpers";
import { getSystemHealth } from "@/lib/admin/health";

export const dynamic = "force-dynamic";

export async function GET() {
  const guard = await requireAdmin("GET /api/admin/health", { resource: "settings", action: "read" });
  if (isError(guard)) return guard;

  const { db } = guard;

  try {
    const health = await getSystemHealth(db);
    const status = health.status === "healthy" ? 200 : 503;
    return NextResponse.json({ health }, { status });
  } catch (e) {
    console.error("[Admin API] GET /health error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
