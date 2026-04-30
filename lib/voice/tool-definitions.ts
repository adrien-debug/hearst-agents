/**
 * Voice Tool Definitions — Build-time merge entre tools Composio user + Hearst.
 *
 * Wrapper qui combine `getVoiceComposioTools` (toolkits actifs OAuth) et
 * `voiceToolDefs` (Hearst natifs : meeting/simulation/image), avec :
 *
 *  - Cache par user (TTL 5 min) — les toolkits actifs changent rarement
 *    en cours de session, et `getToolsForUser` a déjà son propre cache,
 *    mais on cache au niveau du merge pour éviter le coût de map à chaque
 *    mint de session voix.
 *
 *  - Filtre top 10-20 — la voix n'a pas besoin du catalog complet (déjà
 *    appliqué par `composio-bridge.curateForVoice`, MAX_TOOLS_TOTAL = 20).
 *    On laisse cette borne en place et on ajoute juste les Hearst tools
 *    par-dessus (toujours visibles, pas de cap).
 *
 * Côté server only — `getVoiceComposioTools` parle à Composio, donc à ne
 * jamais importer côté client. Pour le client, garder `voiceToolDefs`
 * direct via `./tool-defs.ts`.
 */

import { voiceToolDefs, type VoiceToolDef } from "./tool-defs";
import { getVoiceComposioTools } from "./composio-bridge";

interface CacheEntry {
  tools: VoiceToolDef[];
  fetchedAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, CacheEntry>();

/**
 * Construit la liste de tools voix complète pour une session : Composio
 * (top par toolkit, cap 20) + Hearst natifs (toujours présents).
 *
 * Dépendant du userId pour la curation Composio (chaque user a ses
 * propres toolkits actifs). Cache 5 minutes.
 */
export async function buildVoiceTools(userId: string): Promise<VoiceToolDef[]> {
  const cached = cache.get(userId);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.tools;
  }

  const composio = await getVoiceComposioTools(userId);
  // Hearst natifs en premier — ils sont prioritaires conversationnellement
  // (meeting, simulation, image) et le modèle Realtime tend à pondérer
  // l'ordre des tools dans son sampling.
  const merged = [...voiceToolDefs, ...composio];
  cache.set(userId, { tools: merged, fetchedAt: Date.now() });
  return merged;
}

/** Vide le cache (pour les tests). */
export function clearVoiceToolsCache(): void {
  cache.clear();
}
