/**
 * Cache mémoire des derniers events webhook Recall.ai par botId.
 *
 * Utilisé par /api/v2/meetings/[id] pour fusionner le status pushé par
 * Recall avec le status pull. Pas de durabilité — un redéploiement perd
 * le cache, c'est OK : le polling getBotStatus reste la source de vérité.
 *
 * Capacity bounded à 200 entries (LRU simple via Map insertion order).
 */

export interface RecallWebhookEvent {
  event: string;
  statusCode?: string;
  recordingUrl?: string;
  receivedAt: number;
}

const CACHE_LIMIT = 200;
const cache = new Map<string, RecallWebhookEvent>();

export function recordWebhookEvent(botId: string, event: RecallWebhookEvent): void {
  if (cache.size >= CACHE_LIMIT) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(botId, event);
}

export function getLatestWebhookEvent(botId: string): RecallWebhookEvent | null {
  return cache.get(botId) ?? null;
}

export function clearWebhookCache(): void {
  cache.clear();
}
