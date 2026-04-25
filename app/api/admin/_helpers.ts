/**
 * Admin API — shared helpers for auth + RBAC guard.
 */

import { NextResponse } from "next/server";
import { requireScope, type CanonicalScope } from "@/lib/scope";
import { requireServerSupabase } from "@/lib/supabase-server";
import { checkPermission, type PermissionCheck } from "@/lib/admin/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AdminGuardResult {
  scope: CanonicalScope;
  db: SupabaseClient;
}

/**
 * Validates auth + RBAC in one call.
 * Returns scope + db on success, or throws a NextResponse error.
 */
export async function requireAdmin(
  context: string,
  permission: Omit<PermissionCheck, "userId" | "tenantId">
): Promise<AdminGuardResult | NextResponse> {
  const { scope, error } = await requireScope({ context });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const db = requireServerSupabase();

  const allowed = await checkPermission(db, {
    userId: scope.userId,
    tenantId: scope.tenantId,
    resource: permission.resource,
    action: permission.action,
  });

  if (!allowed) {
    return NextResponse.json(
      { error: "forbidden", message: `Missing ${permission.action} on ${permission.resource}` },
      { status: 403 }
    );
  }

  return { scope, db };
}

export function isError(result: AdminGuardResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
