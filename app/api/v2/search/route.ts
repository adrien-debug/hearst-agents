/**
 * GET /api/v2/search?q=…&limit=20
 *
 * Endpoint agrégé pour le Commandeur sémantique. Cherche dans :
 *  - assets (title ILIKE + embeddings sémantique sur summary) — filtré
 *    par provenance.userId
 *  - threads (chat_messages content ILIKE + embeddings sémantique sur
 *    les messages) — scope user, dédup par conversation_id
 *  - missions (title ILIKE) — scope user
 *  - runs récents (entrypoint ILIKE)
 *  - kg_nodes (label ILIKE) — fail-soft si table inexistante
 *
 * Mode hybride (lexical + sémantique) :
 *  - sans OPENAI_API_KEY → lexical pur (ILIKE multi-table, comme avant)
 *  - avec OPENAI_API_KEY → assets/threads enrichis via `searchEmbeddings`
 *    pour les contenus longs (où la similarité cosine surpasse ILIKE).
 *    Fusion : on dédupe par id, on priorise les hits sémantiques (score
 *    plus élevé), on cap au limit total.
 *
 * Header `X-Search-Mode: lexical|hybrid` pour debug. Le shape de retour
 * `{ assets, threads, missions, runs, kgNodes }` est invariant.
 *
 * Chaque source est fail-soft : une qui throw n'invalide pas le reste.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireScope } from "@/lib/platform/auth/scope";
import { getServerSupabase } from "@/lib/platform/db/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isEmbeddingsAvailable } from "@/lib/embeddings/embed";
import {
  searchEmbeddings,
  type RetrievedEmbedding,
} from "@/lib/embeddings/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rawDb(sb: ReturnType<typeof getServerSupabase>): SupabaseClient<any> | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return sb as unknown as SupabaseClient<any> | null;
}

const querySchema = z.object({
  q: z.string().min(1).max(120),
  limit: z.number().int().min(1).max(50).optional(),
});

interface AssetItem {
  id: string;
  title: string;
  kind: string;
}

interface ThreadItem {
  id: string;
  title: string;
  preview: string;
}

interface SearchResult {
  assets: AssetItem[];
  threads: ThreadItem[];
  missions: Array<{ id: string; title: string; status: string }>;
  runs: Array<{ id: string; label: string; createdAt: string }>;
  kgNodes: Array<{ id: string; label: string; type: string }>;
}

const PER_SECTION_DEFAULT = 5;

function escapeIlike(q: string): string {
  return q.replace(/[\\%_]/g, "\\$&");
}

/**
 * Récupère le `conversationId` d'un embedding `message`. On a deux
 * sources possibles :
 *  - metadata.conversationId (renseigné par l'auto-ingest pipeline)
 *  - sinon, sourceId au format `${conversationId}:${ts}:role`
 */
function extractConversationId(item: RetrievedEmbedding): string | null {
  const fromMeta = (item.metadata as { conversationId?: unknown } | undefined)
    ?.conversationId;
  if (typeof fromMeta === "string" && fromMeta.length > 0) return fromMeta;
  const sid = item.sourceId ?? "";
  const colonIdx = sid.indexOf(":");
  if (colonIdx > 0) return sid.slice(0, colonIdx);
  return null;
}

/**
 * Enrichit la liste des assets retournés par embeddings avec leur kind
 * en allant lire la table `assets`. On reste fail-soft : si la query
 * échoue, on retombe sur "report" comme valeur par défaut.
 */
async function fetchAssetMetadata(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: SupabaseClient<any>,
  ids: string[],
): Promise<Map<string, { title: string; kind: string }>> {
  if (ids.length === 0) return new Map();
  try {
    const { data, error } = await db
      .from("assets")
      .select("id, title, kind")
      .in("id", ids);
    if (error || !data) return new Map();
    const out = new Map<string, { title: string; kind: string }>();
    for (const row of data as Array<Record<string, unknown>>) {
      out.set(row.id as string, {
        title: (row.title as string) ?? "Sans titre",
        kind: (row.kind as string) ?? "report",
      });
    }
    return out;
  } catch {
    return new Map();
  }
}

export async function GET(req: NextRequest) {
  const { scope, error: scopeError } = await requireScope({
    context: "GET /api/v2/search",
  });
  if (scopeError || !scope) {
    return NextResponse.json(
      { error: scopeError?.message ?? "not_authenticated" },
      { status: scopeError?.status ?? 401 },
    );
  }

  const url = new URL(req.url);
  const limitRaw = url.searchParams.get("limit");
  const parsed = querySchema.safeParse({
    q: url.searchParams.get("q") ?? "",
    limit: limitRaw ? Number(limitRaw) : undefined,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation_error", details: parsed.error.format() },
      { status: 400 },
    );
  }

  const { q } = parsed.data;
  const total = parsed.data.limit ?? 20;
  const perSection = Math.max(1, Math.floor(total / 4)); // assets/threads/missions/kg
  const cap = Math.min(perSection, PER_SECTION_DEFAULT);

  const sb = getServerSupabase();
  const db = rawDb(sb);

  const empty: SearchResult = {
    assets: [],
    threads: [],
    missions: [],
    runs: [],
    kgNodes: [],
  };

  if (!db) {
    return NextResponse.json(empty, {
      status: 200,
      headers: { "X-Search-Mode": "lexical" },
    });
  }

  const escaped = escapeIlike(q);
  const pattern = `%${escaped}%`;

  // Assets : filtre user via provenance.userId (JSONB) + title ILIKE.
  const assetsP = db
    .from("assets")
    .select("id, title, kind, provenance")
    .ilike("title", pattern)
    .order("created_at", { ascending: false })
    .limit(cap * 4)
    .then(
      ({ data, error }) => {
        if (error || !data) return [] as AssetItem[];
        return (data as Array<Record<string, unknown>>)
          .filter((row) => {
            const prov = (row.provenance ?? {}) as { userId?: string; tenantId?: string };
            if (prov.tenantId && prov.tenantId !== scope.tenantId) return false;
            if (prov.userId && prov.userId !== scope.userId) return false;
            return true;
          })
          .slice(0, cap)
          .map((row) => ({
            id: row.id as string,
            title: (row.title as string) ?? "Sans titre",
            kind: (row.kind as string) ?? "report",
          }));
      },
      () => [] as AssetItem[],
    );

  // Threads : on cherche dans chat_messages.content puis on dédupe par conversation_id.
  const threadsP = db
    .from("chat_messages")
    .select("conversation_id, content, created_at")
    .eq("user_id", scope.userId)
    .ilike("content", pattern)
    .order("created_at", { ascending: false })
    .limit(cap * 4)
    .then(
      ({ data, error }) => {
        if (error || !data) return [] as ThreadItem[];
        const seen = new Map<string, ThreadItem>();
        for (const row of data as Array<Record<string, unknown>>) {
          const id = row.conversation_id as string;
          if (!id || seen.has(id)) continue;
          const content = (row.content as string) ?? "";
          seen.set(id, {
            id,
            title: content.slice(0, 60).trim() || "Conversation",
            preview: content.slice(0, 140),
          });
          if (seen.size >= cap) break;
        }
        return Array.from(seen.values());
      },
      () => [] as ThreadItem[],
    );

  // Missions : title ILIKE + scope user.
  const missionsP = db
    .from("missions")
    .select("id, title, status")
    .eq("user_id", scope.userId)
    .ilike("title", pattern)
    .order("updated_at", { ascending: false })
    .limit(cap)
    .then(
      ({ data, error }) => {
        if (error || !data) return [] as SearchResult["missions"];
        return (data as Array<Record<string, unknown>>).map((row) => ({
          id: row.id as string,
          title: (row.title as string) ?? "Mission",
          status: (row.status as string) ?? "created",
        }));
      },
      () => [] as SearchResult["missions"],
    );

  // Runs récents : entrypoint ILIKE (fallback : récents tout court).
  const runsP = db
    .from("runs")
    .select("id, entrypoint, created_at")
    .ilike("entrypoint", pattern)
    .order("created_at", { ascending: false })
    .limit(cap)
    .then(
      ({ data, error }) => {
        if (error || !data) return [] as SearchResult["runs"];
        return (data as Array<Record<string, unknown>>).map((row) => ({
          id: row.id as string,
          label: (row.entrypoint as string) ?? "run",
          createdAt: (row.created_at as string) ?? "",
        }));
      },
      () => [] as SearchResult["runs"],
    );

  // KG nodes : label ILIKE + scope user. Fail-soft si table absente.
  const kgP = db
    .from("kg_nodes")
    .select("id, label, type")
    .eq("user_id", scope.userId)
    .ilike("label", pattern)
    .limit(cap)
    .then(
      ({ data, error }) => {
        if (error || !data) return [] as SearchResult["kgNodes"];
        return (data as Array<Record<string, unknown>>).map((row) => ({
          id: row.id as string,
          label: (row.label as string) ?? "node",
          type: (row.type as string) ?? "entity",
        }));
      },
      () => [] as SearchResult["kgNodes"],
    );

  // ── Embeddings (sémantique) — uniquement si OPENAI_API_KEY dispo.
  // Couvre les contenus longs : assets (summary) + threads (messages).
  // Les structures (missions/runs/kgNodes) gardent ILIKE seul, leurs
  // labels sont trop courts pour bénéficier d'un embedding.
  const semanticEnabled = isEmbeddingsAvailable();

  const semanticP: Promise<RetrievedEmbedding[]> = semanticEnabled
    ? searchEmbeddings({
        userId: scope.userId,
        tenantId: scope.tenantId,
        queryText: q,
        k: cap * 2,
        sourceKinds: ["asset", "message"],
      }).catch((err) => {
        console.warn("[search] semantic search failed, fallback lexical:", err);
        return [] as RetrievedEmbedding[];
      })
    : Promise.resolve([] as RetrievedEmbedding[]);

  const [assetsLex, threadsLex, missions, runs, kgNodes, semantic] =
    await Promise.all([assetsP, threadsP, missionsP, runsP, kgP, semanticP]);

  // Fusion lexicale + sémantique pour assets/threads.
  // Stratégie : on commence par les hits sémantiques (score décroissant),
  // puis on complète avec les hits lexicaux non-déjà-présents, jusqu'au cap.
  let assets: AssetItem[] = assetsLex;
  let threads: ThreadItem[] = threadsLex;
  let mode: "lexical" | "hybrid" = "lexical";

  if (semantic.length > 0) {
    mode = "hybrid";

    // Assets sémantiques : on enrichit avec title/kind depuis la table.
    const semAssets = semantic.filter((it) => it.sourceKind === "asset");
    if (semAssets.length > 0) {
      const ids = semAssets.map((it) => it.sourceId).filter(Boolean);
      const meta = await fetchAssetMetadata(db, ids);
      const semAssetItems: AssetItem[] = semAssets
        .filter((it) => meta.has(it.sourceId))
        .map((it) => {
          const m = meta.get(it.sourceId)!;
          return { id: it.sourceId, title: m.title, kind: m.kind };
        });
      const merged = new Map<string, AssetItem>();
      for (const a of semAssetItems) merged.set(a.id, a);
      for (const a of assetsLex) if (!merged.has(a.id)) merged.set(a.id, a);
      assets = Array.from(merged.values()).slice(0, cap);
    }

    // Threads sémantiques : on dédupe par conversationId.
    const semThreads = semantic.filter((it) => it.sourceKind === "message");
    if (semThreads.length > 0) {
      const semByConv = new Map<string, ThreadItem>();
      for (const it of semThreads) {
        const cid = extractConversationId(it);
        if (!cid || semByConv.has(cid)) continue;
        const text = (it.textExcerpt ?? "").trim();
        semByConv.set(cid, {
          id: cid,
          title: text.slice(0, 60).trim() || "Conversation",
          preview: text.slice(0, 140),
        });
      }
      const merged = new Map<string, ThreadItem>();
      for (const [id, t] of semByConv) merged.set(id, t);
      for (const t of threadsLex) if (!merged.has(t.id)) merged.set(t.id, t);
      threads = Array.from(merged.values()).slice(0, cap);
    }
  }

  return NextResponse.json(
    { assets, threads, missions, runs, kgNodes } satisfies SearchResult,
    {
      status: 200,
      headers: { "X-Search-Mode": mode },
    },
  );
}
