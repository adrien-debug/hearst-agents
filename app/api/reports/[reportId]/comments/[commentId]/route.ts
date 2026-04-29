/**
 * DELETE /api/reports/[reportId]/comments/[commentId]
 *
 * Supprime un commentaire. Strict ownership : seul l'auteur peut supprimer
 * (cf `lib/reports/comments/store.ts` — RLS aligné).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import { deleteComment } from "@/lib/reports/comments/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ reportId: string; commentId: string }>;
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { reportId, commentId } = await ctx.params;
  const { scope, error } = await requireScope({
    context: `DELETE /api/reports/${reportId}/comments/${commentId}`,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  // Résoudre le tenantId effectif via l'asset (mêmes règles que GET/POST).
  const sb = getServerSupabase();
  if (!sb) {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
  const { data: asset } = await sb
    .from("assets")
    .select("provenance")
    .eq("id", reportId)
    .maybeSingle();
  if (!asset) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  const provenance = (asset.provenance ?? {}) as Record<string, unknown>;
  const tenantId =
    (provenance.tenantId as string | undefined) ?? scope.tenantId;

  const outcome = await deleteComment({
    commentId,
    userId: scope.userId,
    tenantId,
  });
  if (!outcome.ok) {
    const status =
      outcome.reason === "not_found" ? 404
      : outcome.reason === "forbidden" ? 403
      : outcome.reason === "supabase_unavailable" ? 503
      : 500;
    return NextResponse.json({ error: outcome.reason }, { status });
  }
  return NextResponse.json({ ok: true });
}
