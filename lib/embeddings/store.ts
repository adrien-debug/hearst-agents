/**
 * Embeddings store — Supabase pgvector (table `embeddings`, migration 0046).
 *
 * Trois opérations :
 * - `upsertEmbedding(...)` : compute + persist (best-effort, fail-soft).
 * - `searchEmbeddings(...)` : top-K cosine via SQL RPC `match_embeddings`
 *   (ou fallback ORDER BY si la RPC n'existe pas — la migration 0046
 *   ne crée que la table, le RPC se passe par requête SELECT directe).
 * - `deleteEmbeddings(...)` : cleanup ciblé.
 *
 * Toutes les fonctions throw `EmbeddingsUnavailableError` quand la clé
 * OpenAI manque. Quand Supabase est down, elles loggent et renvoient
 * un résultat vide (search) ou false (upsert) — pipeline jamais bloqué.
 */

import { embedText, EmbeddingsUnavailableError } from "./embed";
import { getServerSupabase } from "@/lib/platform/db/supabase";

export type EmbeddingSourceKind =
  | "message"
  | "asset"
  | "briefing"
  | "kg_node"
  | "transcript";

export interface UpsertEmbeddingInput {
  userId: string;
  tenantId: string;
  sourceKind: EmbeddingSourceKind;
  sourceId: string;
  textExcerpt: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievedEmbedding {
  sourceKind: EmbeddingSourceKind;
  sourceId: string;
  textExcerpt: string;
  similarity: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface SearchEmbeddingsInput {
  userId: string;
  tenantId: string;
  queryText: string;
  k?: number;
  /** Optional filter on a subset of source kinds. */
  sourceKinds?: ReadonlyArray<EmbeddingSourceKind>;
}

const MAX_EXCERPT_CHARS = 4_000;

function clampExcerpt(text: string): string {
  const trimmed = (text ?? "").trim();
  if (trimmed.length <= MAX_EXCERPT_CHARS) return trimmed;
  return trimmed.slice(0, MAX_EXCERPT_CHARS);
}

/**
 * Upsert (compute embedding + persist). Idempotent sur la clé
 * (user_id, tenant_id, source_kind, source_id).
 *
 * Returns `true` si la row a été écrite, `false` si fail-soft (Supabase
 * absent, OpenAI absent, ou erreur DB).
 */
export async function upsertEmbedding(
  input: UpsertEmbeddingInput,
): Promise<boolean> {
  const text = clampExcerpt(input.textExcerpt);
  if (!text) return false;

  const sb = getServerSupabase();
  if (!sb) {
    console.warn("[embeddings/store] Supabase indisponible — upsert skip");
    return false;
  }

  let vec: number[];
  try {
    vec = await embedText(text);
  } catch (err) {
    if (err instanceof EmbeddingsUnavailableError) {
      // Pas de clé OpenAI : on ne logge plus, embed.ts l'a déjà fait au boot.
      return false;
    }
    console.warn("[embeddings/store] embedText failed:", err);
    return false;
  }

  // pgvector accepte un littéral string '[0.1,0.2,...]' OU un array. Le
  // client supabase-js sérialise les arrays en JSON, ce qui casse pour
  // le type vector. On envoie donc le format pgvector explicite.
  const vectorLiteral = `[${vec.join(",")}]`;

  try {
    const payload = {
      user_id: input.userId,
      tenant_id: input.tenantId,
      source_kind: input.sourceKind,
      source_id: input.sourceId,
      text_excerpt: text,
      embedding: vectorLiteral,
      metadata: input.metadata ?? {},
      updated_at: new Date().toISOString(),
    };
    // `embeddings` n'est pas encore dans Database types (migration récente).
    // Cast minimal sur la table pour ne pas bloquer le typecheck global.
    const { error } = await (sb as unknown as {
      from: (
        t: string,
      ) => { upsert: (p: unknown, opts: { onConflict: string }) => Promise<{ error: unknown }> };
    })
      .from("embeddings")
      .upsert(payload, { onConflict: "user_id,tenant_id,source_kind,source_id" });
    if (error) {
      console.warn("[embeddings/store] upsert error:", error);
      return false;
    }
    return true;
  } catch (err) {
    console.warn("[embeddings/store] upsert exception:", err);
    return false;
  }
}

/**
 * Cosine similarity search top-K. Retourne `[]` quand vide ou en erreur.
 *
 * NB : on utilise une requête SQL brute via le service-role Supabase
 * pour exploiter l'opérateur `<=>` (cosine distance pgvector). On ne
 * passe PAS par le query builder, qui ne sait pas exprimer ORDER BY
 * sur un opérateur pgvector.
 */
export async function searchEmbeddings(
  input: SearchEmbeddingsInput,
): Promise<RetrievedEmbedding[]> {
  const k = Math.max(1, Math.min(input.k ?? 5, 50));
  const queryText = (input.queryText ?? "").trim();
  if (!queryText) return [];

  const sb = getServerSupabase();
  if (!sb) {
    console.warn("[embeddings/store] Supabase indisponible — search skip");
    return [];
  }

  let queryVec: number[];
  try {
    queryVec = await embedText(queryText);
  } catch (err) {
    if (!(err instanceof EmbeddingsUnavailableError)) {
      console.warn("[embeddings/store] query embed failed:", err);
    }
    return [];
  }
  const vectorLiteral = `[${queryVec.join(",")}]`;

  // RPC `match_embeddings` (migration 0047) : voie privilégiée. Vrai
  // pgvector cosine côté Postgres, scale jusqu'à des centaines de
  // milliers de rows. Si la RPC n'existe pas ou throw → on bascule
  // sur le fallback JS (scan + cosine en mémoire), avec log warn pour
  // ne pas masquer un déploiement incomplet.
  try {
    const rpcRes = await (sb.rpc as unknown as (
      fn: string,
      args: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: unknown }>)(
      "match_embeddings",
      {
        query_embedding: vectorLiteral,
        match_user_id: input.userId,
        match_tenant_id: input.tenantId,
        match_count: k,
        source_kinds:
          input.sourceKinds && input.sourceKinds.length > 0
            ? Array.from(input.sourceKinds)
            : null,
      },
    );
    if (!rpcRes.error && Array.isArray(rpcRes.data)) {
      return (rpcRes.data as Array<Record<string, unknown>>).map(rowToResult);
    }
    if (rpcRes.error) {
      console.warn(
        "[embeddings/store] match_embeddings RPC error — fallback JS scan:",
        rpcRes.error,
      );
    }
  } catch (err) {
    console.warn(
      "[embeddings/store] match_embeddings RPC threw — fallback JS scan:",
      err,
    );
  }

  // ── Fallback : SELECT * scopé + tri en JS (cosine similarity manuelle)
  try {
    const fetchRes = await (sb as unknown as {
      from: (t: string) => {
        select: (cols: string) => {
          eq: (
            c: string,
            v: string,
          ) => {
            eq: (
              c: string,
              v: string,
            ) => {
              limit: (n: number) => Promise<{ data: unknown; error: unknown }>;
            };
          };
        };
      };
    })
      .from("embeddings")
      .select("source_kind, source_id, text_excerpt, embedding, metadata, created_at")
      .eq("user_id", input.userId)
      .eq("tenant_id", input.tenantId)
      .limit(2_000);

    if (fetchRes.error || !Array.isArray(fetchRes.data)) {
      console.warn("[embeddings/store] fallback search error:", fetchRes.error);
      return [];
    }

    const rows = fetchRes.data as Array<{
      source_kind: EmbeddingSourceKind;
      source_id: string;
      text_excerpt: string;
      embedding: unknown;
      metadata: Record<string, unknown> | null;
      created_at: string;
    }>;

    const filtered = input.sourceKinds && input.sourceKinds.length > 0
      ? rows.filter((r) => input.sourceKinds!.includes(r.source_kind))
      : rows;

    const scored = filtered
      .map((r) => {
        const v = parseEmbedding(r.embedding);
        if (!v) return null;
        const sim = cosine(queryVec, v);
        return {
          sourceKind: r.source_kind,
          sourceId: r.source_id,
          textExcerpt: r.text_excerpt,
          similarity: sim,
          metadata: r.metadata ?? {},
          createdAt: r.created_at,
        } satisfies RetrievedEmbedding;
      })
      .filter((x): x is RetrievedEmbedding => x !== null)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, k);

    return scored;
  } catch (err) {
    console.warn("[embeddings/store] search exception:", err);
    return [];
  }
}

function rowToResult(row: Record<string, unknown>): RetrievedEmbedding {
  return {
    sourceKind: String(row.source_kind ?? "message") as EmbeddingSourceKind,
    sourceId: String(row.source_id ?? ""),
    textExcerpt: String(row.text_excerpt ?? ""),
    similarity: Number(row.similarity ?? row.score ?? 0),
    metadata: (row.metadata as Record<string, unknown>) ?? {},
    createdAt: String(row.created_at ?? new Date().toISOString()),
  };
}

function parseEmbedding(raw: unknown): number[] | null {
  if (Array.isArray(raw)) {
    return raw.map((x) => Number(x)).filter((x) => Number.isFinite(x));
  }
  if (typeof raw === "string") {
    // Format pgvector : "[0.12,0.34,...]"
    const trimmed = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
    if (!trimmed) return null;
    const parts = trimmed.split(",").map((s) => Number(s.trim()));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return parts;
  }
  return null;
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  if (denom === 0) return 0;
  return dot / denom;
}

export interface DeleteEmbeddingsFilter {
  userId: string;
  tenantId: string;
  sourceKind?: EmbeddingSourceKind;
  sourceId?: string;
}

export async function deleteEmbeddings(
  filter: DeleteEmbeddingsFilter,
): Promise<number> {
  const sb = getServerSupabase();
  if (!sb) return 0;

  try {
    const builder = (sb as unknown as {
      from: (t: string) => {
        delete: () => {
          eq: (c: string, v: string) => {
            eq: (c: string, v: string) => unknown;
          };
        };
      };
    })
      .from("embeddings")
      .delete();

    let q = builder.eq("user_id", filter.userId).eq("tenant_id", filter.tenantId) as unknown as {
      eq: (c: string, v: string) => unknown;
      then: Promise<{ data: unknown; error: unknown; count: number | null }>["then"];
    };
    if (filter.sourceKind) {
      q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq(
        "source_kind",
        filter.sourceKind,
      );
    }
    if (filter.sourceId) {
      q = (q as unknown as { eq: (c: string, v: string) => typeof q }).eq(
        "source_id",
        filter.sourceId,
      );
    }
    const res = (await (q as unknown as Promise<{ data: unknown; error: unknown; count: number | null }>)) as {
      error: unknown;
      count: number | null;
    };
    if (res.error) {
      console.warn("[embeddings/store] delete error:", res.error);
      return 0;
    }
    return res.count ?? 0;
  } catch (err) {
    console.warn("[embeddings/store] delete exception:", err);
    return 0;
  }
}
