import { CacheEntry } from '../types';

/**
 * TTL-based cache service for paper data and validation results
 */
export class CacheService {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private ttlMs: number;

  constructor(ttlSeconds: number = 300) {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Get a value from the cache
   */
  get<T>(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }

    return entry.value as T;
  }

  /**
   * Set a value in the cache
   */
  set<T>(key: string, value: T): void {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + this.ttlMs,
    });
  }

  /**
   * Check if a key exists and is not expired
   */
  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Update the TTL setting
   */
  setTTL(ttlSeconds: number): void {
    this.ttlMs = ttlSeconds * 1000;
  }

  /**
   * Remove expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
        pruned++;
      }
    }

    return pruned;
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; ttlMs: number } {
    return {
      size: this.cache.size,
      ttlMs: this.ttlMs,
    };
  }
}

// Singleton instance
let cacheInstance: CacheService | null = null;

/**
 * Get or create the cache service singleton
 */
export function getCacheService(ttlSeconds?: number): CacheService {
  if (!cacheInstance) {
    cacheInstance = new CacheService(ttlSeconds);
  } else if (ttlSeconds !== undefined) {
    cacheInstance.setTTL(ttlSeconds);
  }
  return cacheInstance;
}

/**
 * Reset the cache service singleton (mainly for testing)
 */
export function resetCacheService(): void {
  cacheInstance?.clear();
  cacheInstance = null;
}
