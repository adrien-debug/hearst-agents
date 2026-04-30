/**
 * GET /api/v2/kg/timeline?entityId=<id>
 *
 * Retourne tous les events liés à l'entité : decisions, commitments et
 * autres nodes connectés (via kg_edges in/out), triés par created_at desc.
 *
 * Format : { events: [{ id, kind, label, type, createdAt, relatedNodeId }] }
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import type { KgEdge, KgNode } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMELINE_LIMIT = 50;
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface TimelineEvent {
  id: string;
  kind: "decision" | "commitment" | "related";
  type: string;
  label: string;
  createdAt: string;
  relatedNodeId: string;
  edgeType: string;
}

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

  const entityId = req.nextUrl.searchParams.get("entityId")?.trim() ?? "";
  if (!entityId) {
    return NextResponse.json({ error: "entityId_required" }, { status: 400 });
  }
  if (!UUID_REGEX.test(entityId)) {
    return NextResponse.json(
      {
        error: "invalid_entity_id",
        message: "entityId must be a valid UUID",
      },
      { status: 400 },
    );
  }

  try {
    const sb = requireServerSupabase();

    // Récupère tous les edges incidents au node (in + out).
    const { data: edges, error: edgesErr } = await sb
      .from("kg_edges")
      .select("*")
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId)
      .or(`source_id.eq.${entityId},target_id.eq.${entityId}`);

    if (edgesErr) throw new Error(edgesErr.message);

    const edgeRows = (edges ?? []) as KgEdge[];
    if (edgeRows.length === 0) {
      return NextResponse.json({ events: [] });
    }

    const relatedIds = new Set<string>();
    for (const e of edgeRows) {
      relatedIds.add(e.source_id === entityId ? e.target_id : e.source_id);
    }

    if (relatedIds.size === 0) {
      return NextResponse.json({ events: [] });
    }

    const { data: nodes, error: nodesErr } = await sb
      .from("kg_nodes")
      .select("*")
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId)
      .in("id", [...relatedIds]);

    if (nodesErr) throw new Error(nodesErr.message);
    const nodeRows = (nodes ?? []) as KgNode[];
    const nodeById = new Map(nodeRows.map((n) => [n.id, n]));

    const events: TimelineEvent[] = [];
    for (const e of edgeRows) {
      const otherId = e.source_id === entityId ? e.target_id : e.source_id;
      const node = nodeById.get(otherId);
      if (!node) continue;
      const kind: TimelineEvent["kind"] =
        node.type === "decision" ? "decision"
        : node.type === "commitment" ? "commitment"
        : "related";
      events.push({
        id: `${e.id}::${node.id}`,
        kind,
        type: node.type,
        label: node.label,
        createdAt: node.created_at,
        relatedNodeId: node.id,
        edgeType: e.type,
      });
    }

    events.sort((a, b) => {
      const aT = Date.parse(a.createdAt) || 0;
      const bT = Date.parse(b.createdAt) || 0;
      return bT - aT;
    });

    return NextResponse.json({ events: events.slice(0, TIMELINE_LIMIT) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/timeline] failed:", message);
    return NextResponse.json(
      { error: "timeline_failed", message: "internal_error" },
      { status: 500 },
    );
  }
}
