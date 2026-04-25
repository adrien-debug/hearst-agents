/**
 * GET  /api/admin/permissions?userId=X — get user role (RBAC: admin)
 * POST /api/admin/permissions — assign role (RBAC: admin)
 * DELETE /api/admin/permissions — remove role (RBAC: admin)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdmin, isError } from "../_helpers";
import {
  getUserRole,
  assignRole,
  removeRole,
  getRolePermissions,
  type Role,
} from "@/lib/admin/permissions";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireAdmin("GET /api/admin/permissions", { resource: "users", action: "admin" });
  if (isError(guard)) return guard;

  const { db, scope } = guard;
  const url = new URL(req.url);
  const userId = url.searchParams.get("userId") ?? scope.userId;

  try {
    const role = await getUserRole(db, userId, scope.tenantId);
    const permissions = getRolePermissions(role);
    return NextResponse.json({ userId, role, permissions });
  } catch (e) {
    console.error("[Admin API] GET /permissions error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireAdmin("POST /api/admin/permissions", { resource: "users", action: "admin" });
  if (isError(guard)) return guard;

  const { db, scope } = guard;

  try {
    const { userId, role, tenantId } = await req.json();

    if (!userId || !role) {
      return NextResponse.json({ error: "userId and role are required" }, { status: 400 });
    }

    const validRoles: Role[] = ["admin", "editor", "viewer", "guest"];
    if (!validRoles.includes(role)) {
      return NextResponse.json({ error: `Invalid role. Must be one of: ${validRoles.join(", ")}` }, { status: 400 });
    }

    await assignRole(db, userId, role, tenantId ?? scope.tenantId, scope.userId);
    return NextResponse.json({ success: true, userId, role });
  } catch (e) {
    console.error("[Admin API] POST /permissions error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const guard = await requireAdmin("DELETE /api/admin/permissions", { resource: "users", action: "admin" });
  if (isError(guard)) return guard;

  const { db, scope } = guard;

  try {
    const { userId, tenantId } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: "userId is required" }, { status: 400 });
    }

    await removeRole(db, userId, tenantId ?? scope.tenantId);
    return NextResponse.json({ success: true, userId });
  } catch (e) {
    console.error("[Admin API] DELETE /permissions error:", e);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
