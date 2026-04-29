/**
 * GET /api/reports/[reportId]/versions/diff?from=N&to=M
 *
 * Retourne le diff structurel entre deux versions.
 * `from` = version ancienne, `to` = version récente.
 * Les deux doivent appartenir au même asset et au même tenant.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { getVersion } from "@/lib/reports/versions/store";
import { diffVersions } from "@/lib/reports/versions/diff";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

const diffQuerySchema = z.object({
  from: z.coerce.number().int().min(1),
  to: z.coerce.number().int().min(1),
});

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

export async function GET(req: NextRequest, ctx: RouteContext) {
  const { reportId } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `GET /api/reports/${reportId}/versions/diff`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const url = new URL(req.url);
  const qParsed = diffQuerySchema.safeParse({
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
  });
  if (!qParsed.success) {
    return NextResponse.json(
      { error: "invalid_query", details: qParsed.error.issues },
      { status: 400 },
    );
  }

  if (qParsed.data.from === qParsed.data.to) {
    return NextResponse.json({ diffs: [] });
  }

  const resolved = await resolveAssetTenant(reportId, scope.userId, scope.tenantId);
  if ("error" in resolved) {
    const status =
      resolved.error === "forbidden" ? 403
      : resolved.error === "not_found" ? 404
      : 503;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const [versionFrom, versionTo] = await Promise.all([
    getVersion({ assetId: reportId, versionNumber: qParsed.data.from, tenantId: resolved.tenantId }),
    getVersion({ assetId: reportId, versionNumber: qParsed.data.to, tenantId: resolved.tenantId }),
  ]);

  if (!versionFrom) {
    return NextResponse.json({ error: "version_from_not_found" }, { status: 404 });
  }
  if (!versionTo) {
    return NextResponse.json({ error: "version_to_not_found" }, { status: 404 });
  }

  const diffs = diffVersions(
    versionFrom.renderSnapshot,
    versionTo.renderSnapshot,
    versionFrom.narrationSnapshot,
    versionTo.narrationSnapshot,
  );

  return NextResponse.json({
    from: qParsed.data.from,
    to: qParsed.data.to,
    diffs,
  });
}
