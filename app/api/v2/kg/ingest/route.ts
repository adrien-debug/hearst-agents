/**
 * POST /api/v2/kg/ingest — Ingest un texte → entités + relations.
 *
 * Signature 7 MVP : Claude haiku extrait, on persiste dans kg_nodes /
 * kg_edges scoped (user_id, tenant_id). Phase B suivante : Letta + Zep
 * + pgvector pour mémoire long terme et raisonnement.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { extractEntities, upsertNode, upsertEdge } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "POST /api/v2/kg/ingest",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  let body: { text?: string; sourceLabel?: string };
  try {
    body = (await req.json()) as { text?: string; sourceLabel?: string };
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const text = body.text?.trim() ?? "";
  if (!text) {
    return NextResponse.json({ error: "text_required" }, { status: 400 });
  }

  try {
    const { entities, relations } = await extractEntities(text);

    const nodeIdByLabel = new Map<string, string>();
    let entitiesCreated = 0;
    for (const entity of entities) {
      const id = await upsertNode(
        { userId: scope.userId, tenantId: scope.tenantId },
        { type: entity.type, label: entity.label, properties: entity.properties ?? {} },
      );
      nodeIdByLabel.set(entity.label, id);
      entitiesCreated += 1;
    }

    let edgesCreated = 0;
    for (const relation of relations) {
      const sourceId = nodeIdByLabel.get(relation.source_label);
      const targetId = nodeIdByLabel.get(relation.target_label);
      if (!sourceId || !targetId) continue;
      await upsertEdge(
        { userId: scope.userId, tenantId: scope.tenantId },
        {
          source_id: sourceId,
          target_id: targetId,
          type: relation.type,
          weight: relation.weight,
        },
      );
      edgesCreated += 1;
    }

    return NextResponse.json({ entitiesCreated, edgesCreated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/ingest] failed:", message);
    return NextResponse.json({ error: "ingest_failed", message }, { status: 500 });
  }
}
