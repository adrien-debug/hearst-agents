import { NextResponse } from "next/server";
import { requireScope, type CanonicalScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { checkPermission, type PermissionCheck } from "@/lib/admin/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";

interface AdminGuardResult {
  scope: CanonicalScope;
  db: SupabaseClient;
}

export async function requireAdmin(
  context: string,
  permission: Omit<PermissionCheck, "userId" | "tenantId">
): Promise<AdminGuardResult | NextResponse> {
  const { scope, error } = await requireScope({ context });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const db = getServerSupabase();
  if (!db) {
    return NextResponse.json({ error: "db_unavailable" }, { status: 503 });
  }

  try {
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
  } catch {
    // Permission check failed (e.g. invalid userId format in dev mode).
    // Deny access rather than let an uncaught error bubble to 500.
    return NextResponse.json({ error: "permission_check_failed" }, { status: 503 });
  }

  return { scope, db };
}

export function isError(result: AdminGuardResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}
