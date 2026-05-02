/**
 * POST /api/v2/kg/query
 *
 * Recherche sémantique dans le Knowledge Graph user-scoped.
 * Body : { question: string, withNarrative?: boolean, limit?: number }
 * Réponse : { nodes: KgNode[], edges: KgEdge[], narrative: string | null }
 *
 * Symétrique du tool agent query_knowledge_graph (même fonction interne
 * runKgQuery). Utile pour debug, scripts, et UI directe (KnowledgeStage
 * ou ContextRail).
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { runKgQuery } from "@/lib/tools/native/kg-query";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  question: z.string().min(1).max(500),
  withNarrative: z.boolean().optional(),
  limit: z.number().int().min(1).max(20).optional(),
});

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/kg/query",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
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
      { error: "invalid_input", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result = await runKgQuery(
      { userId: scope.userId, tenantId: scope.tenantId },
      parsed.data,
    );
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/query] failed:", message);
    return NextResponse.json({ error: "query_failed", message }, { status: 500 });
  }
}
