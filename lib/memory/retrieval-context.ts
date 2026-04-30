/**
 * Retrieval-context — recherche sémantique top-K dans `embeddings` et
 * formate un bloc texte injectable dans le system prompt sous la balise
 * `<retrieved_memory>`.
 *
 * Cache 30s par (userId, tenantId, hash(message)) pour éviter de
 * ré-embedder la même query si l'utilisateur enchaîne deux tours sur
 * la même intention.
 *
 * Cap stricte 1500 chars (cf. budget cacheable Anthropic). Chaque ligne
 * préfixée par le source_kind pour que le modèle puisse pondérer.
 *
 * Fail-soft : retour string vide en cas d'erreur ou de OPENAI_API_KEY
 * absent. Le pipeline tourne sans retrieved memory.
 */

import { searchEmbeddings, type RetrievedEmbedding } from "@/lib/embeddings/store";

const MAX_TOTAL_CHARS = 1500;
const PER_ITEM_MAX = 220;
const CACHE_TTL_MS = 30_000;
const DEFAULT_K = 5;

interface CacheEntry {
  text: string;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export interface RetrievedMemoryParams {
  userId: string;
  tenantId: string;
  currentMessage: string;
  k?: number;
}

function hashMessage(s: string): string {
  // FNV-1a 32-bit — suffisant pour cache key, on n'a besoin que d'un
  // hash uniforme sur ~1k entrées max par process.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(16);
}

function labelFor(kind: RetrievedEmbedding["sourceKind"]): string {
  switch (kind) {
    case "message":
      return "message";
    case "asset":
      return "asset";
    case "briefing":
      return "briefing";
    case "kg_node":
      return "kg";
    case "transcript":
      return "transcript";
    default:
      return "mem";
  }
}

function clampLine(text: string, max: number): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (oneLine.length <= max) return oneLine;
  return oneLine.slice(0, max - 1) + "…";
}

export function formatRetrievedItems(items: RetrievedEmbedding[]): string {
  if (items.length === 0) return "";

  // Sort by similarity desc (sécurité : déjà fait en amont).
  const sorted = [...items].sort((a, b) => b.similarity - a.similarity);

  const header = "Souvenirs pertinents (proches de la requête, ordonnés par similarité) :";
  const lines: string[] = [header];
  let total = header.length + 1;

  for (const item of sorted) {
    const excerpt = clampLine(item.textExcerpt, PER_ITEM_MAX);
    const line = `- [${labelFor(item.sourceKind)}] ${excerpt}`;
    if (total + line.length + 1 > MAX_TOTAL_CHARS) break;
    lines.push(line);
    total += line.length + 1;
  }

  if (lines.length <= 1) return "";
  return lines.join("\n");
}

/**
 * Récupère top-K embeddings pour le user et formate en bloc texte.
 * Retourne string vide si rien de pertinent ou si erreur.
 */
export async function getRetrievedMemoryForUser(
  params: RetrievedMemoryParams,
): Promise<string> {
  const { userId, tenantId, currentMessage, k = DEFAULT_K } = params;
  const trimmed = (currentMessage ?? "").trim();
  if (!trimmed || !userId) return "";

  const cacheKey = `${userId}::${tenantId}::${hashMessage(trimmed)}::k${k}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.text;
  }

  let text = "";
  try {
    const items = await searchEmbeddings({
      userId,
      tenantId,
      queryText: trimmed,
      k,
    });
    text = formatRetrievedItems(items);
  } catch (err) {
    console.warn("[retrieval-context] search failed:", err);
    text = "";
  }

  cache.set(cacheKey, { text, expiresAt: now + CACHE_TTL_MS });
  return text;
}

/** Test-only : reset cache. */
export function __clearRetrievalCache(): void {
  cache.clear();
}
