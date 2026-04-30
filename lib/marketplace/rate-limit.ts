/**
 * Rate limit in-memory pour les écritures marketplace.
 *
 * MVP : 10 actions / minute par (userId, action). Pas de Redis, ne survit pas
 * au restart, ne se synchronise pas entre instances. Acceptable pour un MVP
 * marketplace single-region.
 */

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 10;

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();

export function checkRateLimit(userId: string, action: string): boolean {
  const key = `${userId}:${action}`;
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < WINDOW_MS);
  if (bucket.hits.length >= MAX_PER_WINDOW) return false;
  bucket.hits.push(now);
  return true;
}

/** Test helper — efface tous les buckets. */
export function __clearRateLimits(): void {
  buckets.clear();
}
