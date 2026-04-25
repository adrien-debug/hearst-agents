/**
 * Hybrid Storage Provider
 *
 * Hot storage (local) + Cold storage (R2/S3).
 * LRU cache pour fichiers fréquemment accédés.
 * Migration automatique cold → hot sur accès.
 */

import type {
  StorageProvider,
  StorageObject,
  UploadResult,
  DownloadResult,
  SignedUrlOptions,
} from "./types";
import { LocalStorageProvider } from "./local";
import { R2StorageProvider } from "./r2";

interface CacheEntry {
  key: string;
  size: number;
  lastAccessed: number;
  accessCount: number;
}

export interface HybridStorageOptions {
  hotProvider: LocalStorageProvider;
  coldProvider: R2StorageProvider;
  maxHotSizeBytes: number; // e.g., 100MB
  maxHotFiles: number; // e.g., 1000
  ttlSeconds: number; // e.g., 86400 (24h)
}

export class HybridStorageProvider implements StorageProvider {
  readonly type = "hybrid" as const;
  private hot: LocalStorageProvider;
  private cold: R2StorageProvider;
  private maxHotSize: number;
  private maxHotFiles: number;
  private ttlMs: number;
  private cache: Map<string, CacheEntry> = new Map();
  private currentHotSize = 0;

  constructor(options: HybridStorageOptions) {
    this.hot = options.hotProvider;
    this.cold = options.coldProvider;
    this.maxHotSize = options.maxHotSizeBytes;
    this.maxHotFiles = options.maxHotFiles;
    this.ttlMs = options.ttlSeconds * 1000;
  }

  async upload(
    key: string,
    data: Buffer | ReadableStream<Uint8Array>,
    options: {
      contentType: string;
      metadata?: Record<string, string>;
      tenantId?: string;
    }
  ): Promise<UploadResult> {
    // Always upload to cold storage (source of truth)
    const coldResult = await this.cold.upload(key, data, options);

    // For small files, also cache in hot storage
    if (
      data instanceof Buffer &&
      data.length < this.maxHotSize * 0.1 // 10% of max
    ) {
      await this.hot.upload(key, data, options);
      this.updateCache(key, data.length);
    }

    return coldResult;
  }

  async download(key: string, tenantId?: string): Promise<DownloadResult> {
    // Check hot storage first (fast path)
    if (await this.hot.exists(key, tenantId)) {
      const result = await this.hot.download(key, tenantId);
      this.updateCache(key, result.size);
      return result;
    }

    // Fetch from cold and cache if appropriate
    const coldResult = await this.cold.download(key, tenantId);

    // Cache small files in hot storage
    if (coldResult.size < this.maxHotSize * 0.1) {
      // Read stream to buffer
      const reader = coldResult.stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
      }
      const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

      // Write to hot storage
      await this.hot.upload(
        key,
        buffer,
        {
          contentType: coldResult.contentType,
          tenantId,
        }
      );

      this.updateCache(key, coldResult.size);

      // Return new stream from buffer
      return {
        stream: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(new Uint8Array(buffer));
            controller.close();
          },
        }),
        contentType: coldResult.contentType,
        size: coldResult.size,
      };
    }

    return coldResult;
  }

  async getSignedUrl(
    key: string,
    operation: "read" | "write",
    options?: SignedUrlOptions,
    tenantId?: string
  ): Promise<string> {
    // Always use cold storage for signed URLs (authoritative)
    return this.cold.getSignedUrl(key, operation, options, tenantId);
  }

  async delete(key: string, tenantId?: string): Promise<void> {
    // Delete from both
    await Promise.all([
      this.hot.delete(key, tenantId).catch(() => {}),
      this.cold.delete(key, tenantId),
    ]);
    this.cache.delete(key);
  }

  async exists(key: string, tenantId?: string): Promise<boolean> {
    // Check hot first, then cold
    return (
      (await this.hot.exists(key, tenantId)) ||
      (await this.cold.exists(key, tenantId))
    );
  }

  async list(prefix: string, tenantId?: string): Promise<StorageObject[]> {
    // List from cold (authoritative)
    return this.cold.list(prefix, tenantId);
  }

  async health(): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
    const start = Date.now();
    const [hotHealth, coldHealth] = await Promise.all([
      this.hot.health(),
      this.cold.health(),
    ]);

    const ok = hotHealth.ok && coldHealth.ok;
    const errors = [
      hotHealth.error,
      coldHealth.error,
    ].filter(Boolean);

    return {
      ok,
      latencyMs: Date.now() - start,
      error: errors.length > 0 ? errors.join("; ") : undefined,
    };
  }

  /**
   * Force sync cold → hot (admin/maintenance)
   */
  async warmCache(
    keys: string[],
    tenantId?: string
  ): Promise<{ warmed: number; failed: number }> {
    let warmed = 0;
    let failed = 0;

    for (const key of keys) {
      try {
        if (await this.hot.exists(key, tenantId)) continue;

        const coldResult = await this.cold.download(key, tenantId);
        if (coldResult.size > this.maxHotSize * 0.5) continue; // Skip large

        // Read to buffer
        const reader = coldResult.stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        const buffer = Buffer.concat(chunks.map((c) => Buffer.from(c)));

        await this.hot.upload(
          key,
          buffer,
          { contentType: coldResult.contentType, tenantId }
        );
        this.updateCache(key, coldResult.size);
        warmed++;
      } catch {
        failed++;
      }
    }

    return { warmed, failed };
  }

  private updateCache(key: string, size: number): void {
    const existing = this.cache.get(key);
    if (existing) {
      existing.lastAccessed = Date.now();
      existing.accessCount++;
    } else {
      // Evict if needed
      this.evictIfNeeded(size);

      this.cache.set(key, {
        key,
        size,
        lastAccessed: Date.now(),
        accessCount: 1,
      });
      this.currentHotSize += size;
    }
  }

  private evictIfNeeded(neededSpace: number): void {
    // Check TTL eviction first
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (now - entry.lastAccessed > this.ttlMs) {
        this.cache.delete(key);
        this.currentHotSize -= entry.size;
        // Note: Actual file deletion happens via GC or manual cleanup
      }
    }

    // LRU eviction if still needed
    while (
      (this.currentHotSize + neededSpace > this.maxHotSize ||
        this.cache.size >= this.maxHotFiles) &&
      this.cache.size > 0
    ) {
      // Find LRU entry
      let lruKey: string | null = null;
      let lruTime = Infinity;

      for (const [key, entry] of this.cache) {
        if (entry.lastAccessed < lruTime) {
          lruTime = entry.lastAccessed;
          lruKey = key;
        }
      }

      if (lruKey) {
        const entry = this.cache.get(lruKey)!;
        this.cache.delete(lruKey);
        this.currentHotSize -= entry.size;
        // Async delete from hot storage (don't block)
        this.hot.delete(lruKey).catch(() => {});
      } else {
        break;
      }
    }
  }

  getCacheStats(): {
    files: number;
    size: number;
    maxSize: number;
    hitRate: number;
  } {
    return {
      files: this.cache.size,
      size: this.currentHotSize,
      maxSize: this.maxHotSize,
      hitRate: 0, // Would need tracking in real impl
    };
  }
}
