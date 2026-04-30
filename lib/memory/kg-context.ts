/**
 * KG context summary — résumé compact des entités/relations récentes du
 * Knowledge Graph d'un user, injecté dans le system prompt à chaque tour
 * d'orchestration.
 *
 * Format texte cible (≤ 1500 chars) :
 *   Personnes : Adrien (founder), John Doe (CFO ACME).
 *   Entreprises : ACME Corp.
 *   Projets : Hearst OS (en dev), Board pack Q2.
 *   Décisions : Migrer vers v2 le 15/05.
 *   Engagements : Envoyer roadmap à John d'ici vendredi.
 *
 * Cache mémoire 60s par (userId, tenantId) pour éviter les requêtes répétées
 * sur des tours rapprochés. Fail-soft : toute erreur DB renvoie null
 * (l'orchestrator continue sans contexte KG).
 */

import { getGraph, type KgNode } from "./kg";

const CACHE_TTL_MS = 60_000;
const MAX_TOTAL_CHARS = 1500;

interface CachedEntry {
  text: string | null;
  expiresAt: number;
}

const cache = new Map<string, CachedEntry>();

function cacheKey(userId: string, tenantId: string): string {
  return `${userId}::${tenantId}`;
}

interface CategoryConfig {
  type: KgNode["type"];
  label: string;
  maxItems: number;
}

// Ordre = priorité d'inclusion. Si on dépasse 1500 chars, on coupe d'abord
// dans les catégories en bas (topic) avant les hautes (person/decision).
const CATEGORIES: ReadonlyArray<CategoryConfig> = [
  { type: "person", label: "Personnes", maxItems: 8 },
  { type: "company", label: "Entreprises", maxItems: 6 },
  { type: "project", label: "Projets", maxItems: 6 },
  { type: "decision", label: "Décisions", maxItems: 5 },
  { type: "commitment", label: "Engagements", maxItems: 5 },
  { type: "topic", label: "Sujets", maxItems: 5 },
];

function formatNode(node: KgNode): string {
  const props = node.properties as Record<string, unknown> | null | undefined;
  const role =
    props && typeof props === "object"
      ? (props.role as string | undefined) ?? (props.title as string | undefined)
      : undefined;
  if (role && typeof role === "string" && role.trim()) {
    return `${node.label} (${role.trim().slice(0, 40)})`;
  }
  return node.label;
}

function buildSummaryText(nodes: KgNode[]): string | null {
  if (nodes.length === 0) return null;

  // Sort par updated_at desc — plus récent d'abord.
  const sorted = [...nodes].sort((a, b) => {
    const aT = Date.parse(a.updated_at) || 0;
    const bT = Date.parse(b.updated_at) || 0;
    return bT - aT;
  });

  const grouped = new Map<string, KgNode[]>();
  for (const n of sorted) {
    const arr = grouped.get(n.type) ?? [];
    arr.push(n);
    grouped.set(n.type, arr);
  }

  const lines: string[] = [];
  let totalChars = 0;

  for (const cat of CATEGORIES) {
    const items = grouped.get(cat.type);
    if (!items || items.length === 0) continue;
    const formatted = items.slice(0, cat.maxItems).map(formatNode).join(", ");
    const line = `${cat.label} : ${formatted}.`;
    if (totalChars + line.length + 1 > MAX_TOTAL_CHARS) break;
    lines.push(line);
    totalChars += line.length + 1;
  }

  if (lines.length === 0) return null;
  return lines.join("\n");
}

export interface KgContextOptions {
  /** Bypass le cache mémoire — utile pour les tests. */
  bypassCache?: boolean;
}

/**
 * Retourne un résumé compact du KG du user pour injection en system prompt.
 * Renvoie null si vide ou erreur (jamais throw).
 */
export async function getKgContextForUser(
  userId: string,
  tenantId: string,
  opts: KgContextOptions = {},
): Promise<string | null> {
  const key = cacheKey(userId, tenantId);
  const now = Date.now();

  if (!opts.bypassCache) {
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) {
      return cached.text;
    }
  }

  let text: string | null = null;
  try {
    const graph = await getGraph({ userId, tenantId });
    text = buildSummaryText(graph.nodes);
  } catch (err) {
    console.warn("[kg-context] getGraph failed:", err);
    text = null;
  }

  cache.set(key, { text, expiresAt: now + CACHE_TTL_MS });
  return text;
}

/** Test-only : vide le cache. */
export function __clearKgContextCache(): void {
  cache.clear();
}
