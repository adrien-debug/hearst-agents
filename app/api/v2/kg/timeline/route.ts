/**
 * GET /api/v2/kg/timeline?entityId=<nodeId>&limit=<n>
 *
 * Timeline d'une entité — events (edges + node lié) triés par date desc.
 * UI : KgNodeDetail.tsx — bouton "Voir la timeline" dans le panel détail.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getEntityTimeline } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  entityId: z.string().uuid(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/kg/timeline",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    entityId: searchParams.get("entityId"),
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const events = await getEntityTimeline(
      { userId: scope.userId, tenantId: scope.tenantId },
      parsed.data.entityId,
      parsed.data.limit,
    );
    return NextResponse.json({ events });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/timeline] failed:", message);
    return NextResponse.json({ error: "timeline_failed", message }, { status: 500 });
  }
}
