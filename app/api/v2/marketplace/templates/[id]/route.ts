/**
 * GET    /api/v2/marketplace/templates/[id]  — detail (avec payload + ratings)
 * DELETE /api/v2/marketplace/templates/[id]  — archive (soft delete owner-only)
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import {
  archiveTemplate,
  getTemplate,
  listRatings,
} from "@/lib/marketplace/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { error } = await requireScope({
    context: "GET /api/v2/marketplace/templates/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const template = await getTemplate(id);
  if (!template) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const ratings = await listRatings(id);

  return NextResponse.json({ template, ratings });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { scope, error } = await requireScope({
    context: "DELETE /api/v2/marketplace/templates/[id]",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  const ok = await archiveTemplate(id, scope.userId);
  if (!ok) {
    return NextResponse.json({ error: "archive_failed" }, { status: 500 });
  }
  return NextResponse.json({ archived: true });
}
