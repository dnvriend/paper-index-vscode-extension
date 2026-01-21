import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { CacheService, getCacheService, resetCacheService } from '../../src/services/cacheService';

describe('CacheService', () => {
  let cache: CacheService;

  beforeEach(() => {
    cache = new CacheService(60); // 60 second TTL
  });

  describe('get/set', () => {
    it('should store and retrieve values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should handle complex objects', () => {
      const obj = { name: 'test', data: [1, 2, 3] };
      cache.set('complex', obj);
      expect(cache.get('complex')).toEqual(obj);
    });
  });

  describe('has', () => {
    it('should return true for existing keys', () => {
      cache.set('exists', 'value');
      expect(cache.has('exists')).toBe(true);
    });

    it('should return false for missing keys', () => {
      expect(cache.has('missing')).toBe(false);
    });
  });

  describe('delete', () => {
    it('should remove a key', () => {
      cache.set('key', 'value');
      expect(cache.has('key')).toBe(true);

      cache.delete('key');
      expect(cache.has('key')).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      cache.clear();

      expect(cache.has('key1')).toBe(false);
      expect(cache.has('key2')).toBe(false);
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      vi.useFakeTimers();

      const shortTTLCache = new CacheService(1); // 1 second TTL
      shortTTLCache.set('key', 'value');

      expect(shortTTLCache.get('key')).toBe('value');

      // Advance time past TTL
      vi.advanceTimersByTime(2000);

      expect(shortTTLCache.get('key')).toBeUndefined();

      vi.useRealTimers();
    });
  });

  describe('prune', () => {
    it('should remove expired entries', () => {
      vi.useFakeTimers();

      const shortTTLCache = new CacheService(1);
      shortTTLCache.set('key1', 'value1');
      shortTTLCache.set('key2', 'value2');

      vi.advanceTimersByTime(2000);

      const pruned = shortTTLCache.prune();

      expect(pruned).toBe(2);
      expect(shortTTLCache.stats().size).toBe(0);

      vi.useRealTimers();
    });
  });

  describe('stats', () => {
    it('should return correct statistics', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.stats();

      expect(stats.size).toBe(2);
      expect(stats.ttlMs).toBe(60000);
    });
  });
});

describe('getCacheService singleton', () => {
  beforeEach(() => {
    resetCacheService();
  });

  afterEach(() => {
    resetCacheService();
  });

  it('should return the same instance', () => {
    const cache1 = getCacheService(60);
    const cache2 = getCacheService();

    expect(cache1).toBe(cache2);
  });

  it('should update TTL when specified', () => {
    const cache1 = getCacheService(60);
    expect(cache1.stats().ttlMs).toBe(60000);

    getCacheService(120);
    expect(cache1.stats().ttlMs).toBe(120000);
  });
});
