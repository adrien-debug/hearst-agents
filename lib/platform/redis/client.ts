/**
 * Redis client — wrapper unifié.
 *
 * Sélectionne automatiquement le backend selon les env vars :
 * - Si UPSTASH_REDIS_REST_URL + _TOKEN : utilise @upstash/redis (REST API,
 *   serverless-friendly, pas de pool TCP à gérer).
 * - Sinon REDIS_URL : utilise ioredis (TCP). Fallback dev local.
 * - Sinon : retourne null.
 *
 * L'interface exposée matche celle d'ioredis pour les méthodes utilisées :
 * get / set / setex / del / lpush / expire — les call sites n'ont pas à changer.
 *
 * Usages :
 *  - WAL (write-ahead log) pour les écritures Supabase critiques (chat_messages)
 *  - Backing store de BullMQ (Phase 0) — note : BullMQ utilise sa propre
 *    connexion ioredis dans lib/jobs/connection.ts, pas ce client.
 *  - Cache de webhooks et préflight connectors.
 */

import IoRedis from "ioredis";
import { Redis as UpstashRedis } from "@upstash/redis";

interface RedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: "EX", ttlSeconds?: number): Promise<unknown>;
  setex(key: string, ttlSeconds: number, value: string): Promise<unknown>;
  del(key: string): Promise<number>;
  lpush(key: string, value: string): Promise<number>;
  expire(key: string, seconds: number): Promise<number>;
}

class UpstashAdapter implements RedisClient {
  constructor(private readonly client: UpstashRedis) {}

  async get(key: string): Promise<string | null> {
    const result = await this.client.get<string>(key);
    return result ?? null;
  }

  async set(
    key: string,
    value: string,
    mode?: "EX",
    ttlSeconds?: number,
  ): Promise<unknown> {
    if (mode === "EX" && ttlSeconds !== undefined) {
      return await this.client.set(key, value, { ex: ttlSeconds });
    }
    return await this.client.set(key, value);
  }

  async setex(key: string, ttlSeconds: number, value: string): Promise<unknown> {
    return await this.client.set(key, value, { ex: ttlSeconds });
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async lpush(key: string, value: string): Promise<number> {
    return await this.client.lpush(key, value);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const result = await this.client.expire(key, seconds);
    return typeof result === "number" ? result : Number(result);
  }
}

let _client: RedisClient | null = null;
let _initialized = false;

export function getRedis(): RedisClient | null {
  if (_initialized) return _client;
  _initialized = true;

  const upstashUrl = process.env.UPSTASH_REDIS_REST_URL;
  const upstashToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (upstashUrl && upstashToken) {
    try {
      const upstash = new UpstashRedis({
        url: upstashUrl,
        token: upstashToken,
        // Désactive le JSON auto-parse pour matcher l'API ioredis (string brut).
        automaticDeserialization: false,
      });
      _client = new UpstashAdapter(upstash);
      return _client;
    } catch (err) {
      console.error("[Redis] Failed to initialize Upstash REST client:", err);
    }
  }

  const url = process.env.REDIS_URL;
  if (!url) {
    console.warn("[Redis] No REDIS backend configured (Upstash REST or REDIS_URL) — running without WAL/cache layer");
    return null;
  }

  try {
    const ioredis = new IoRedis(url, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2_000,
    });
    ioredis.on("error", (err) => {
      console.warn("[Redis] error:", err.message);
    });
    _client = ioredis as unknown as RedisClient;
    return _client;
  } catch (err) {
    console.error("[Redis] Failed to initialize ioredis client:", err);
    return null;
  }
}

