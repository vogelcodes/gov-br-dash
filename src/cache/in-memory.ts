import type { CacheStore, CacheStats } from "./store.js";

interface CacheEntry<T> {
  value: T;
  expiresAt: number | null;
  lastAccessed: number;
}

interface InMemoryCacheOptions {
  maxEntries?: number;
  defaultTtlSeconds?: number;
}

export class InMemoryCacheStore<T = unknown> implements CacheStore<T> {
  private readonly cache = new Map<string, CacheEntry<T>>();
  private readonly maxEntries: number;
  private readonly defaultTtlSeconds: number;
  private accessSequence = 0;
  private _hits = 0;
  private _misses = 0;
  private _evictions = 0;
  private readonly pending = new Map<string, Promise<T>>();

  get stats(): CacheStats {
    return {
      hits: this._hits,
      misses: this._misses,
      size: this.cache.size,
      evictions: this._evictions,
    };
  }

  constructor(options: InMemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? 10000;
    this.defaultTtlSeconds = options.defaultTtlSeconds ?? 60;
  }

  async get(key: string): Promise<T | undefined> {
    const entry = this.cache.get(key);

    if (!entry) {
      this._misses++;
      return undefined;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      this._misses++;
      return undefined;
    }

    entry.lastAccessed = this.nextAccessSequence();
    this._hits++;
    return entry.value;
  }

  async set(key: string, value: T, ttlSeconds?: number): Promise<void> {
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictLRU();
    }

    const ttl = ttlSeconds ?? this.defaultTtlSeconds;
    const expiresAt = ttl === 0 ? null : Date.now() + ttl * 1000;

    this.cache.set(key, {
      value,
      expiresAt,
      lastAccessed: this.nextAccessSequence(),
    });
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this._hits = 0;
    this._misses = 0;
    this._evictions = 0;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.cache.delete(key);
      return false;
    }

    return true;
  }

  async getOrSet(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds?: number,
  ): Promise<T> {
    const cached = await this.get(key);
    if (cached !== undefined) {
      return cached;
    }

    let pending = this.pending.get(key);
    if (pending) {
      return pending;
    }

    pending = (async () => {
      const value = await factory();
      await this.set(key, value, ttlSeconds);
      return value;
    })().finally(() => {
      this.pending.delete(key);
    });

    this.pending.set(key, pending);
    return pending;
  }

  private evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this._evictions++;
    }
  }

  private nextAccessSequence(): number {
    this.accessSequence += 1;
    return this.accessSequence;
  }
}
