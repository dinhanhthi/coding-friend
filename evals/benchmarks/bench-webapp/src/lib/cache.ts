interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/**
 * Simple in-memory cache with TTL support.
 *
 * PERFORMANCE ISSUE: Expired entries are never removed from the map.
 * They are only skipped on read (lazy expiration), but the memory
 * is never reclaimed. Over time this causes unbounded memory growth.
 */
export class Cache {
  private store = new Map<string, CacheEntry<unknown>>();

  /**
   * Gets a value from the cache. Returns undefined if the key
   * doesn't exist or the entry has expired.
   */
  get<T>(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (Date.now() > entry.expiresAt) {
      // Entry expired — but we don't delete it (memory leak)
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Sets a value in the cache with a TTL in milliseconds.
   */
  set<T>(key: string, value: T, ttlMs: number): void {
    this.store.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
    });
  }

  /**
   * Clears all entries from the cache.
   */
  clear(): void {
    this.store.clear();
  }

  /**
   * Returns the number of entries in the cache (including expired).
   */
  get size(): number {
    return this.store.size;
  }
}
