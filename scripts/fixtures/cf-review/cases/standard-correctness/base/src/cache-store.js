export class CacheStore {
  constructor(ttlMs, clock = Date.now) {
    this.ttlMs = ttlMs;
    this.clock = clock;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      return undefined;
    }
    if (this.clock() - entry.storedAt >= this.ttlMs) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value) {
    this.entries.set(key, { value, storedAt: this.clock() });
  }

  get size() {
    return this.entries.size;
  }
}
