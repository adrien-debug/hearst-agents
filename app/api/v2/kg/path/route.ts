/**
 * GET /api/v2/kg/path?from=<id>&to=<id>&maxHops=<n>
 *
 * BFS sur kg_edges depuis `from` jusqu'à `to`, scoped (user_id, tenant_id).
 * Retourne le chemin minimum (path: nodes[], edges[]) ou path: null si
 * pas de chemin trouvé sous maxHops (default 4).
 *
 * Implémentation : load full graph user-scoped (volume max ~quelques milliers
 * d'edges au MVP), BFS in-memory. Quand le graph dépassera, on passera à
 * une CTE récursive Postgres.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { getGraph, type KgEdge, type KgNode } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MAX_HOPS = 4;
const ABSOLUTE_MAX_HOPS = 8;

interface BfsResult {
  nodeIds: string[];
  edgeIds: string[];
}

/** BFS bidirectionnel léger (sur edges considérés non-orientés pour l'UX). */
function findPath(
  edges: KgEdge[],
  fromId: string,
  toId: string,
  maxHops: number,
): BfsResult | null {
  if (fromId === toId) return { nodeIds: [fromId], edgeIds: [] };

  // adjacency: nodeId → array of { neighborId, edgeId }
  const adj = new Map<string, Array<{ to: string; edgeId: string }>>();
  for (const e of edges) {
    if (!adj.has(e.source_id)) adj.set(e.source_id, []);
    adj.get(e.source_id)!.push({ to: e.target_id, edgeId: e.id });
    if (!adj.has(e.target_id)) adj.set(e.target_id, []);
    adj.get(e.target_id)!.push({ to: e.source_id, edgeId: e.id });
  }

  const parent = new Map<string, { from: string; edgeId: string }>();
  const visited = new Set<string>([fromId]);
  const queue: Array<{ id: string; depth: number }> = [{ id: fromId, depth: 0 }];

  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.depth >= maxHops) continue;
    const neighbors = adj.get(cur.id) ?? [];
    for (const { to, edgeId } of neighbors) {
      if (visited.has(to)) continue;
      visited.add(to);
      parent.set(to, { from: cur.id, edgeId });
      if (to === toId) {
        // reconstruire le chemin
        const nodeIds: string[] = [toId];
        const edgeIds: string[] = [];
        let cursor = toId;
        while (cursor !== fromId) {
          const p = parent.get(cursor);
          if (!p) break;
          edgeIds.unshift(p.edgeId);
          nodeIds.unshift(p.from);
          cursor = p.from;
        }
        return { nodeIds, edgeIds };
      }
      queue.push({ id: to, depth: cur.depth + 1 });
    }
  }
  return null;
}

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

  const fromId = req.nextUrl.searchParams.get("from")?.trim() ?? "";
  const toId = req.nextUrl.searchParams.get("to")?.trim() ?? "";
  if (!fromId || !toId) {
    return NextResponse.json({ error: "from_and_to_required" }, { status: 400 });
  }

  const maxHopsRaw = Number(req.nextUrl.searchParams.get("maxHops") ?? DEFAULT_MAX_HOPS);
  const maxHops = Number.isFinite(maxHopsRaw)
    ? Math.min(Math.max(1, Math.trunc(maxHopsRaw)), ABSOLUTE_MAX_HOPS)
    : DEFAULT_MAX_HOPS;

  try {
    const graph = await getGraph({ userId: scope.userId, tenantId: scope.tenantId });
    const result = findPath(graph.edges, fromId, toId, maxHops);

    if (!result) {
      return NextResponse.json({ path: null });
    }

    const nodeMap = new Map<string, KgNode>(graph.nodes.map((n) => [n.id, n]));
    const edgeMap = new Map<string, KgEdge>(graph.edges.map((e) => [e.id, e]));
    const pathNodes = result.nodeIds
      .map((id) => nodeMap.get(id))
      .filter((n): n is KgNode => Boolean(n));
    const pathEdges = result.edgeIds
      .map((id) => edgeMap.get(id))
      .filter((e): e is KgEdge => Boolean(e));

    return NextResponse.json({
      path: { nodes: pathNodes, edges: pathEdges, hops: pathEdges.length },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/path] failed:", message);
    return NextResponse.json({ error: "path_failed", message }, { status: 500 });
  }
}
