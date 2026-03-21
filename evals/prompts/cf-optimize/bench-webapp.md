The cache module (src/lib/cache.ts) has a performance issue — expired entries are never cleaned up, causing memory to grow indefinitely. Optimize it.
