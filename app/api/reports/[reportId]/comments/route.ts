/**
 * /api/reports/[reportId]/comments
 *
 *   GET  → liste des commentaires sur un report (asset kind=report)
 *   POST → ajoute un commentaire
 *
 * `[reportId]` désigne l'`asset.id` (text). On vérifie que l'asset existe et
 * appartient au tenant du caller (le tenant peut être absent en dev — on
 * s'aligne sur le pattern `requireScope`).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import {
  addComment,
  listComments,
} from "@/lib/reports/comments/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ reportId: string }>;
}

const postBodySchema = z.object({
  body: z.string().min(1).max(4000),
  blockRef: z.string().min(1).max(120).optional(),
});

/**
 * Vérifie que l'asset existe et que le caller a accès. Retourne le tenant_id
 * effectif (provenance.tenantId fallback scope.tenantId) ou null si l'asset
 * n'existe pas / n'appartient pas au caller.
 */
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
  if (
    provenance.userId !== undefined &&
    provenance.userId !== callerUserId
  ) {
    return { error: "forbidden" };
  }
  const tenantId =
    (provenance.tenantId as string | undefined) ?? fallbackTenantId;
  return { tenantId };
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { reportId } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `GET /api/reports/${reportId}/comments`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const resolved = await resolveAssetTenant(reportId, scope.userId, scope.tenantId);
  if ("error" in resolved) {
    const status =
      resolved.error === "forbidden" ? 403
      : resolved.error === "not_found" ? 404
      : 503;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const comments = await listComments({
    assetId: reportId,
    tenantId: resolved.tenantId,
    limit: 100,
  });

  return NextResponse.json({ comments });
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { reportId } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `POST /api/reports/${reportId}/comments`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const resolved = await resolveAssetTenant(reportId, scope.userId, scope.tenantId);
  if ("error" in resolved) {
    const status =
      resolved.error === "forbidden" ? 403
      : resolved.error === "not_found" ? 404
      : 503;
    return NextResponse.json({ error: resolved.error }, { status });
  }

  const created = await addComment({
    assetId: reportId,
    tenantId: resolved.tenantId,
    userId: scope.userId,
    blockRef: parsed.data.blockRef ?? null,
    body: parsed.data.body,
  });
  if (!created) {
    return NextResponse.json({ error: "persistence_failed" }, { status: 500 });
  }
  return NextResponse.json({ comment: created }, { status: 201 });
}
