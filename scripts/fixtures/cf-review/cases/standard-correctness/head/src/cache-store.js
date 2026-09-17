export class CacheStore {
  constructor(ttlMs, clock = Date.now) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.entries = new Map();
  }

  isFresh(entry) {
    return this.clock() - entry.storedAt < this.ttlMs;
  }

  get(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (this.isFresh(entry)) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.entries.set(key, { value, storedAt: this.clock() });
  }

  prune() {
    for (const [key, entry] of this.entries) {
      if (!this.isFresh(entry)) {
        this.entries.delete(key);
      }
    }
  }

  get size() {
    return this.entries.size;
  }
}
