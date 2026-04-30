/**
 * GET /api/v2/memory/search?q=string&k=10&kinds=message,asset
 *
 * Recherche sémantique top-K sur la table `embeddings` scoped
 * (user_id, tenant_id). Renvoie 503 si OPENAI_API_KEY absent.
 *
 * Utilisé par le Commandeur (vague 2 sémantique) une fois pgvector en
 * place. Surface publique stable : `{ items: RetrievedItem[] }`.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireScope } from "@/lib/platform/auth/scope";
import { isEmbeddingsAvailable } from "@/lib/embeddings/embed";
import {
  searchEmbeddings,
  type EmbeddingSourceKind,
  type RetrievedEmbedding,
} from "@/lib/embeddings/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_KINDS: ReadonlyArray<EmbeddingSourceKind> = [
  "message",
  "asset",
  "briefing",
  "kg_node",
  "transcript",
];

function parseKinds(raw: string | null): EmbeddingSourceKind[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => ALLOWED_KINDS.includes(p as EmbeddingSourceKind));
  if (parts.length === 0) return undefined;
  return parts as EmbeddingSourceKind[];
}

interface ApiItem {
  sourceKind: EmbeddingSourceKind;
  sourceId: string;
  textExcerpt: string;
  similarity: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

function toApi(item: RetrievedEmbedding): ApiItem {
  return {
    sourceKind: item.sourceKind,
    sourceId: item.sourceId,
    textExcerpt: item.textExcerpt,
    similarity: item.similarity,
    metadata: item.metadata,
    createdAt: item.createdAt,
  };
}

export async function GET(req: NextRequest) {
  const { scope, error } = await requireScope({
    context: "GET /api/v2/memory/search",
  });
  if (error || !scope) {
    return NextResponse.json(
      { error: error?.message ?? "not_authenticated" },
      { status: error?.status ?? 401 },
    );
  }

  if (!isEmbeddingsAvailable()) {
    return NextResponse.json(
      { error: "embeddings_unavailable", message: "OPENAI_API_KEY non configuré." },
      { status: 503 },
    );
  }

  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (!q) {
    return NextResponse.json({ items: [] });
  }

  const kRaw = Number(req.nextUrl.searchParams.get("k") ?? "10");
  const k = Number.isFinite(kRaw) ? Math.max(1, Math.min(kRaw, 50)) : 10;
  const kinds = parseKinds(req.nextUrl.searchParams.get("kinds"));

  try {
    const items = await searchEmbeddings({
      userId: scope.userId,
      tenantId: scope.tenantId,
      queryText: q,
      k,
      sourceKinds: kinds,
    });
    return NextResponse.json({ items: items.map(toApi) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[memory/search] failed:", message);
    return NextResponse.json(
      { error: "search_failed", message },
      { status: 500 },
    );
  }
}
