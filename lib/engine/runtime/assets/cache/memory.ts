/**
 * In-Memory LRU Cache — Architecture Finale
 *
 * L1 cache for asset metadata (per-process, fast access).
 * Uses Map insertion order: most-recently-used entries are at the end,
 * least-recently-used at the front. On get(), entries are moved to the end.
 * Path: lib/engine/runtime/assets/cache/memory.ts
 */

interface CacheEntry<T> {
  value: T;
  expiresAt?: number;
}

export class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private maxSize: number;

  constructor(maxSize = 1000) {
    this.maxSize = maxSize;
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    // Move to end (most-recently-used) for true LRU ordering
    this.store.delete(key);
    this.store.set(key, entry);

    return entry.value as T;
  }

  set<T>(key: string, value: T, ttlSeconds?: number): void {
    // If key already exists, delete first to refresh position
    if (this.store.has(key)) {
      this.store.delete(key);
    } else if (this.store.size >= this.maxSize) {
      // Evict least-recently-used (first entry in Map)
      const firstKey = this.store.keys().next().value;
      if (firstKey) this.store.delete(firstKey);
    }

    const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : undefined;
    this.store.set(key, { value, expiresAt });
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (entry.expiresAt && Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }
}

// Singleton instance for the runtime
export const globalMemoryCache = new MemoryCache();
