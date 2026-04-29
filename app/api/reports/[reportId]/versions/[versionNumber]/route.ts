/**
 * GET  /api/reports/[reportId]/versions/[versionNumber]  → version complète
 * POST /api/reports/[reportId]/versions/[versionNumber]  → restaurer (re-run + nouvelle version)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getVersion } from "@/lib/reports/versions/store";
import { restoreVersion } from "@/lib/reports/versions/restore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ reportId: string; versionNumber: string }>;
}

const versionNumberSchema = z.coerce.number().int().min(1);

async function resolveAssetTenant(
  reportId: string,
  callerUserId: string,
  fallbackTenantId: string,
): Promise<{ tenantId: string } | { error: "not_found" | "forbidden" | "unavailable" }> {
  const sb = getServerSupabase();
  if (!sb) return { error: "unavailable" };

  const { data, error } = await sb
    .from("assets")
    .select("id, kind, provenance")
    .eq("id", reportId)
    .maybeSingle();
  if (error) return { error: "unavailable" };
  if (!data) return { error: "not_found" };
  if (data.kind !== "report") return { error: "not_found" };

  const provenance = (data.provenance ?? {}) as Record<string, unknown>;
  if (provenance.userId !== undefined && provenance.userId !== callerUserId) {
    return { error: "forbidden" };
  }
  const tenantId = (provenance.tenantId as string | undefined) ?? fallbackTenantId;
  return { tenantId };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { reportId, versionNumber: vn } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `GET /api/reports/${reportId}/versions/${vn}`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const vnParsed = versionNumberSchema.safeParse(vn);
  if (!vnParsed.success) {
    return NextResponse.json({ error: "invalid_version_number" }, { status: 400 });
  }

  const resolved = await resolveAssetTenant(reportId, scope.userId, scope.tenantId);
  if ("error" in resolved) {
    const status =
      resolved.error === "forbidden" ? 403
      : resolved.error === "not_found" ? 404
      : 503;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const version = await getVersion({
    assetId: reportId,
    versionNumber: vnParsed.data,
    tenantId: resolved.tenantId,
  });

  if (!version) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ version });
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { reportId, versionNumber: vn } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `POST /api/reports/${reportId}/versions/${vn}`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const vnParsed = versionNumberSchema.safeParse(vn);
  if (!vnParsed.success) {
    return NextResponse.json({ error: "invalid_version_number" }, { status: 400 });
  }

  const resolved = await resolveAssetTenant(reportId, scope.userId, scope.tenantId);
  if ("error" in resolved) {
    const status =
      resolved.error === "forbidden" ? 403
      : resolved.error === "not_found" ? 404
      : 503;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const outcome = await restoreVersion({
    assetId: reportId,
    versionNumber: vnParsed.data,
    tenantId: resolved.tenantId,
    userId: scope.userId,
  });

  if (!outcome.ok) {
    const status =
      outcome.reason === "version_not_found" ? 404
      : outcome.reason === "invalid_spec" ? 422
      : 500;
    return NextResponse.json({ error: outcome.reason }, { status });
  }

  return NextResponse.json({ version: outcome.newVersion }, { status: 201 });
}
