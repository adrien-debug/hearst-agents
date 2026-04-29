/**
 * Redis client — Lazy singleton.
 *
 * Used as :
 *  - WAL (write-ahead log) pour les écritures Supabase critiques
 *    (chat_messages) → garantit zéro perte si le process crash entre
 *    le retour de la requête et l'arrivée du write Supabase.
 *  - Backing store de BullMQ (Phase 0 fondations) pour les jobs lourds
 *    (image-gen, video-gen, browser-task, meeting-bot, etc.).
 *  - Cache de webhooks et préflight connectors.
 *
 * Sans REDIS_URL : `getRedis()` retourne null. Le code appelant doit
 * dégrader proprement (fallback direct Supabase, pas de queue, etc.).
 * En dev local, on tourne sans Redis tant qu'on ne pousse pas du
 * traitement async lourd ou un test multi-instance.
 */

import Redis from "ioredis";

let _client: Redis | null = null;
let _initialized = false;

export function getRedis(): Redis | null {
  if (_initialized) return _client;
  _initialized = true;

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[Redis] REDIS_URL not set — running without WAL/queue layer");
    return null;
  }

  try {
    _client = new Redis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
    });
    _client.on("error", (err) => {
      // Avoid crashing the process on transient Redis errors. Callers
      // already have null-safe paths (Supabase direct write, in-memory
      // fallback, etc.).
      console.warn("[Redis] error:", err.message);
    });
    return _client;
  } catch (err) {
    console.error("[Redis] Failed to initialize client:", err);
    return null;
  }
}

/**
 * Test-only — drops the cached singleton so the next `getRedis()` re-reads
 * `REDIS_URL` and rebuilds. Should never be called in production code.
 */
export function resetRedisForTests(): void {
  if (_client) {
    void _client.quit().catch(() => {});
  }
  _client = null;
  _initialized = false;
}
