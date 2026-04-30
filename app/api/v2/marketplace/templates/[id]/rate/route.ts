/**
 * POST /api/v2/marketplace/templates/[id]/rate
 * Body : { rating: 1-5, comment?: string }
 *
 * Upsert d'une note user → recalcul rating_avg / rating_count via trigger SQL
 * (et fallback applicatif si trigger absent).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { rateTemplate } from "@/lib/marketplace/store";
import { checkRateLimit } from "@/lib/marketplace/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface RouteContext {
  params: Promise<{ id: string }>;
}

const bodySchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const { scope, error } = await requireScope({
    context: "POST /api/v2/marketplace/templates/[id]/rate",
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }

  if (!checkRateLimit(scope.userId, "rate")) {
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

  const ok = await rateTemplate(
    id,
    scope.userId,
    parsed.data.rating,
    parsed.data.comment,
  );

  if (!ok) {
    return NextResponse.json({ error: "rate_failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
