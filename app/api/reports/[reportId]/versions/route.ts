/**
 * GET /api/reports/[reportId]/versions
 *
 * Liste les versions d'un report (métadonnées seulement, sans render_snapshot).
 * Triées version_number DESC.
 *
 * Query params :
 *   limit  (optionnel, défaut 50, max 200)
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { listVersions } from "@/lib/reports/versions/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
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
    context: `GET /api/reports/${reportId}/versions`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const url = new URL(req.url);
  const qParsed = querySchema.safeParse({ limit: url.searchParams.get("limit") ?? 50 });
  const limit = qParsed.success ? qParsed.data.limit : 50;

  const resolved = await resolveAssetTenant(reportId, scope.userId, scope.tenantId);
  if ("error" in resolved) {
    const status =
      resolved.error === "forbidden" ? 403
      : resolved.error === "not_found" ? 404
      : 503;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const versions = await listVersions({
    assetId: reportId,
    tenantId: resolved.tenantId,
    limit,
  });

  return NextResponse.json({ versions });
}
