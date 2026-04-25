/**
 * Redis Cache Provider — Architecture Finale
 *
 * L2 cache for asset metadata and hot files.
 * Path: lib/engine/runtime/assets/cache/redis.ts
 *
 * Requires: `npm install ioredis`
 */

import type Redis from "ioredis";

type IORedisClient = Redis;

export interface RedisCacheConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  tls?: boolean;
  maxRetriesPerRequest?: number;
  enableReadyCheck?: boolean;
}

export class RedisCache {
  private client: IORedisClient | null = null;
  private config: RedisCacheConfig;
  private isConnected = false;

  constructor(config: RedisCacheConfig) {
    this.config = {
      keyPrefix: "hearst:",
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      ...config,
    };
  }

  /**
   * Lazy initialization of Redis client
   */
  private async getClient(): Promise<IORedisClient | null> {
    if (this.client) return this.client;

    try {
      const ioredis = await import("ioredis");
      const Redis = ioredis.Redis || ioredis.default;

      this.client = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db ?? 0,
        keyPrefix: this.config.keyPrefix,
        maxRetriesPerRequest: this.config.maxRetriesPerRequest,
        enableReadyCheck: this.config.enableReadyCheck,
        lazyConnect: true,
      });

      // Test connection
      await this.client.connect();
      this.isConnected = true;

      // Handle disconnection
      this.client.on("error", (err: Error) => {
        console.error("[RedisCache] Client error:", err);
        this.isConnected = false;
      });

      this.client.on("end", () => {
        console.log("[RedisCache] Connection closed");
        this.isConnected = false;
      });

      return this.client;
    } catch (err) {
      console.error("[RedisCache] Failed to initialize client:", err);
      return null;
    }
  }

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | null> {
    const client = await this.getClient();
    if (!client) return null;

    try {
      const value = await client.get(key);
      if (!value) return null;

      try {
        return JSON.parse(value) as T;
      } catch {
        return value as unknown as T;
      }
    } catch (err) {
      console.error("[RedisCache] GET error:", err);
      return null;
    }
  }

  /**
   * Set a value in cache with optional TTL
   */
  async set<T>(
    key: string,
    value: T,
    ttlSeconds?: number
  ): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      const serialized = JSON.stringify(value);

      if (ttlSeconds && ttlSeconds > 0) {
        await client.setex(key, ttlSeconds, serialized);
      } else {
        await client.set(key, serialized);
      }
    } catch (err) {
      console.error("[RedisCache] SET error:", err);
    }
  }

  /**
   * Delete a key from cache
   */
  async delete(key: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      await client.del(key);
    } catch (err) {
      console.error("[RedisCache] DEL error:", err);
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async deletePattern(pattern: string): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      const keys = await client.keys(pattern);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.error("[RedisCache] DELETE pattern error:", err);
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    if (!client) return false;

    try {
      const result = await client.exists(key);
      return result === 1;
    } catch (err) {
      console.error("[RedisCache] EXISTS error:", err);
      return false;
    }
  }

  /**
   * Get multiple values
   */
  async mget<T>(keys: string[]): Promise<(T | null)[]> {
    const client = await this.getClient();
    if (!client) return keys.map(() => null);

    try {
      const values = await client.mget(keys);
      return values.map((v: string | null) => {
        if (!v) return null;
        try {
          return JSON.parse(v) as T;
        } catch {
          return v as unknown as T;
        }
      });
    } catch (err) {
      console.error("[RedisCache] MGET error:", err);
      return keys.map(() => null);
    }
  }

  /**
   * Set multiple values
   */
  async mset<T>(entries: Array<[string, T]>, ttlSeconds?: number): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      const pipeline = client.pipeline();

      for (const [key, value] of entries) {
        const serialized = JSON.stringify(value);
        if (ttlSeconds && ttlSeconds > 0) {
          pipeline.setex(key, ttlSeconds, serialized);
        } else {
          pipeline.set(key, serialized);
        }
      }

      await pipeline.exec();
    } catch (err) {
      console.error("[RedisCache] MSET error:", err);
    }
  }

  /**
   * Increment a counter
   */
  async increment(key: string, amount = 1): Promise<number> {
    const client = await this.getClient();
    if (!client) return 0;

    try {
      return await client.incrby(key, amount);
    } catch (err) {
      console.error("[RedisCache] INCR error:", err);
      return 0;
    }
  }

  /**
   * Decrement a counter
   */
  async decrement(key: string, amount = 1): Promise<number> {
    const client = await this.getClient();
    if (!client) return 0;

    try {
      return await client.decrby(key, amount);
    } catch (err) {
      console.error("[RedisCache] DECR error:", err);
      return 0;
    }
  }

  /**
   * Set key expiration
   */
  async expire(key: string, ttlSeconds: number): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      await client.expire(key, ttlSeconds);
    } catch (err) {
      console.error("[RedisCache] EXPIRE error:", err);
    }
  }

  /**
   * Get TTL for a key
   */
  async ttl(key: string): Promise<number> {
    const client = await this.getClient();
    if (!client) return -2;

    try {
      return await client.ttl(key);
    } catch (err) {
      console.error("[RedisCache] TTL error:", err);
      return -2;
    }
  }

  /**
   * Flush all cache (use with caution)
   */
  async flush(): Promise<void> {
    const client = await this.getClient();
    if (!client) return;

    try {
      // Only flush keys with our prefix
      const keys = await client.keys(`${this.config.keyPrefix}*`);
      if (keys.length > 0) {
        await client.del(...keys);
      }
    } catch (err) {
      console.error("[RedisCache] FLUSH error:", err);
    }
  }

  /**
   * Health check
   */
  async health(): Promise<{ ok: boolean; latencyMs: number; connected: boolean }> {
    const start = Date.now();
    const client = await this.getClient();

    if (!client) {
      return { ok: false, latencyMs: 0, connected: false };
    }

    try {
      await client.ping();
      return {
        ok: true,
        latencyMs: Date.now() - start,
        connected: this.isConnected,
      };
    } catch {
      return { ok: false, latencyMs: 0, connected: false };
    }
  }

  /**
   * Close connection
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.client = null;
      this.isConnected = false;
    }
  }

  /**
   * Get cache stats
   */
  async getStats(): Promise<{
    connected: boolean;
    keyCount: number;
    memoryUsage?: string;
  }> {
    const client = await this.getClient();
    if (!client) {
      return { connected: false, keyCount: 0 };
    }

    try {
      const keys = await client.keys(`${this.config.keyPrefix}*`);
      const info = await client.info("memory");
      const memoryLine = info.split("\n").find((l: string) => l.startsWith("used_memory_human:"));

      return {
        connected: this.isConnected,
        keyCount: keys.length,
        memoryUsage: memoryLine?.split(":")[1]?.trim(),
      };
    } catch {
      return { connected: this.isConnected, keyCount: 0 };
    }
  }
}

/**
 * Create cache instance from environment variables
 */
export function createRedisCacheFromEnv(): RedisCache {
  return new RedisCache({
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0"),
    keyPrefix: process.env.REDIS_KEY_PREFIX || "hearst:",
  });
}

// Singleton instance for the runtime
let globalRedisCache: RedisCache | null = null;

export function getGlobalRedisCache(): RedisCache {
  if (!globalRedisCache) {
    globalRedisCache = createRedisCacheFromEnv();
  }
  return globalRedisCache;
}
