/**
 * GET /api/v2/kg/path?from=<nodeId>&to=<nodeId>&maxHops=<n>
 *
 * Plus court chemin (BFS bidirectionnel) entre deux nodes du graphe.
 * UI : KnowledgeStage.tsx — pathfinder, highlight des nodes/edges sur Cytoscape.
 *
 * Retourne { path: { nodes, edges, hops } } ou { path: null } si pas trouvé.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { findPath } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  from: z.string().uuid(),
  to: z.string().uuid(),
  maxHops: z.coerce.number().int().min(1).max(6).optional().default(4),
});

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/kg/path",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    from: searchParams.get("from"),
    to: searchParams.get("to"),
    maxHops: searchParams.get("maxHops") ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const path = await findPath(
      { userId: scope.userId, tenantId: scope.tenantId },
      parsed.data.from,
      parsed.data.to,
      parsed.data.maxHops,
    );
    return NextResponse.json({ path });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/path] failed:", message);
    return NextResponse.json({ error: "path_failed", message }, { status: 500 });
  }
}
