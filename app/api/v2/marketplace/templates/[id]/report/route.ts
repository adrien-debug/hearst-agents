/**
 * POST /api/v2/marketplace/templates/[id]/report
 * Body : { reason: string }
 *
 * Signalement abuse — insertion simple dans marketplace_reports. Modération
 * manuelle out-of-scope MVP.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { reportTemplate } from "@/lib/marketplace/store";
import { checkRateLimit } from "@/lib/marketplace/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  reason: z.string().min(3).max(500),
});

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { scope, error } = await requireScope({
    context: "POST /api/v2/marketplace/templates/[id]/report",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (!checkRateLimit(scope.userId, "report")) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", details: parsed.error.issues },
      { status: 400 },
    );
  }

  const ok = await reportTemplate(id, scope.userId, parsed.data.reason);
  if (!ok) {
    return NextResponse.json({ error: "report_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
