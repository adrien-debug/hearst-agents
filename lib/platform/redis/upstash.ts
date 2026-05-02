/**
 * Upstash Redis — REST client compatible Vercel serverless.
 *
 * Remplace lib/platform/redis/client.ts (ioredis TCP) pour le hot path :
 * cache, WAL, rate-limit. Pas de pool de connexions à gérer.
 *
 * No-op si UPSTASH_REDIS_REST_URL absent.
 */

import { Redis } from "@upstash/redis";

let _client: Redis | null = null;

export function getUpstash(): Redis | null {
  if (_client) return _client;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;
  _client = new Redis({ url, token });
  return _client;
}

export const isUpstashEnabled = (): boolean =>
  Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
