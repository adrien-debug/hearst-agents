/**
 * GET /api/v2/kg/graph — retourne le Knowledge Graph user-scoped.
 *
 * Signature 7 MVP : Cytoscape côté client consomme directement
 * { nodes, edges }. Phase B suivante : pagination + filtres (par type
 * d'entité, par profondeur depuis un focus node).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getGraph } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/kg/graph",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  try {
    const graph = await getGraph({ userId: scope.userId, tenantId: scope.tenantId });
    return NextResponse.json(graph);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/graph] failed:", message);
    return NextResponse.json({ error: "graph_fetch_failed", message }, { status: 500 });
  }
}
