/**
 * GET /api/v2/kg/search?q=<query>
 *
 * Recherche fuzzy de nodes par label (ILIKE %q%). User-scoped.
 * UI : KnowledgeStage.tsx — highlight des hits sur le graphe Cytoscape.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { searchNodes } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/kg/search",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q"),
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const nodes = await searchNodes(
      { userId: scope.userId, tenantId: scope.tenantId },
      parsed.data.q,
      parsed.data.limit,
    );
    return NextResponse.json({ nodes });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/search] failed:", message);
    return NextResponse.json({ error: "search_failed", message }, { status: 500 });
  }
}
