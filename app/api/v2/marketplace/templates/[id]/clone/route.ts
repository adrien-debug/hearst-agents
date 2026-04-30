/**
 * POST /api/v2/marketplace/templates/[id]/clone — clone le template dans le tenant du caller
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { cloneTemplate } from "@/lib/marketplace/store";
import { checkRateLimit } from "@/lib/marketplace/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { scope, error } = await requireScope({
    context: "POST /api/v2/marketplace/templates/[id]/clone",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (!checkRateLimit(scope.userId, "clone")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  const result = await cloneTemplate(
    id,
    scope.userId,
    scope.tenantId,
    scope.workspaceId,
  );
  if (!result.ok) {
    const status = result.error === "template_not_found" ? 404 : 500;
    return NextResponse.json(
      { error: result.error ?? "clone_failed" },
      { status },
    );
  }

  return NextResponse.json({ ok: true, resourceId: result.resourceId }, { status: 201 });
}
