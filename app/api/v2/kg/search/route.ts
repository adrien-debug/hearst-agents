/**
 * GET /api/v2/kg/search?q=string
 *
 * Recherche fuzzy ILIKE sur kg_nodes.label scoped (user_id, tenant_id).
 * Retourne les top 20 nodes pertinents avec un score de relevance basique
 * (match exact > préfixe > infixe).
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { requireServerSupabase } from "@/lib/platform/db/supabase";
import type { KgNode } from "@/lib/memory/kg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_LIMIT = 20;

interface SearchHit {
  id: string;
  type: string;
  label: string;
  properties: Record<string, unknown>;
  relevance: number;
}

function scoreRelevance(label: string, query: string): number {
  const l = label.toLowerCase();
  const q = query.toLowerCase();
  if (l === q) return 1.0;
  if (l.startsWith(q)) return 0.8;
  if (l.includes(q)) return 0.6;
  return 0.4;
}

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

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ nodes: [] });
  }

  try {
    const sb = requireServerSupabase();
    // Escape ILIKE wildcards puis encadre par %.
    const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
    const pattern = `%${escaped}%`;

    const { data, error } = await sb
      .from("kg_nodes")
      .select("*")
      .eq("user_id", scope.userId)
      .eq("tenant_id", scope.tenantId)
      .ilike("label", pattern)
      .limit(SEARCH_LIMIT);

    if (error) {
      throw new Error(error.message);
    }

    const rawNodes = (data ?? []) as KgNode[];
    const hits: SearchHit[] = rawNodes
      .map((n) => ({
        id: n.id,
        type: n.type,
        label: n.label,
        properties: (n.properties ?? {}) as Record<string, unknown>,
        relevance: scoreRelevance(n.label, q),
      }))
      .sort((a, b) => b.relevance - a.relevance);

    return NextResponse.json({ nodes: hits });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[kg/search] failed:", message);
    return NextResponse.json({ error: "search_failed", message }, { status: 500 });
  }
}
