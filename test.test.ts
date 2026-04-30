import { InMemoryCacheStore } from "./src/cache/in-memory.js";

describe("InMemoryCacheStore", () => {
  let cache: InMemoryCacheStore;

  const createCache = (options = {}) => {
    return new InMemoryCacheStore({
      maxEntries: 100,
      defaultTtlSeconds: 60,
      ...options,
    });
  };

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("set and get", () => {
    it("returns undefined for missing key", async () => {
      cache = createCache();
      const result = await cache.get("missing");
      expect(result).toBeUndefined();
    });

    it("returns stored value after set", async () => {
      cache = createCache();
      await cache.set("key1", "value1");
      const result = await cache.get("key1");
      expect(result).toBe("value1");
    });

    it("overwrites existing value", async () => {
      cache = createCache();
      await cache.set("key1", "value1");
      await cache.set("key1", "value2");
      const result = await cache.get("key1");
      expect(result).toBe("value2");
    });

    it("stores complex objects", async () => {
      cache = createCache();
      const obj = { data: { nested: true }, count: 42 };
      await cache.set("key1", obj);
      const result = await cache.get("key1");
      expect(result).toEqual(obj);
    });
  });

  describe("TTL expiration", () => {
    it("returns undefined after TTL expires", async () => {
      cache = createCache({ defaultTtlSeconds: 60 });
      await cache.set("key1", "value1");

      vi.advanceTimersByTime(61 * 1000);

      const result = await cache.get("key1");
      expect(result).toBeUndefined();
    });

    it("respects custom TTL per entry", async () => {
      cache = createCache({ defaultTtlSeconds: 60 });
      await cache.set("key1", "value1", 5);

      vi.advanceTimersByTime(4 * 1000);
      expect(await cache.get("key1")).toBe("value1");

      vi.advanceTimersByTime(2 * 1000);
      expect(await cache.get("key1")).toBeUndefined();
    });

    it("expires only the specific key", async () => {
      cache = createCache({ defaultTtlSeconds: 60 });
      await cache.set("key1", "value1");
      await cache.set("key2", "value2", 5);

      vi.advanceTimersByTime(6 * 1000);

      expect(await cache.get("key1")).toBe("value1");
      expect(await cache.get("key2")).toBeUndefined();
    });

    it("treats TTL of 0 as no expiration", async () => {
      cache = createCache({ defaultTtlSeconds: 60 });
      await cache.set("key1", "value1", 0);

      vi.advanceTimersByTime(1000 * 60 * 60);

      const result = await cache.get("key1");
      expect(result).toBe("value1");
    });
  });

  describe("delete", () => {
    it("removes key from cache", async () => {
      cache = createCache();
      await cache.set("key1", "value1");
      await cache.delete("key1");
      const result = await cache.get("key1");
      expect(result).toBeUndefined();
    });

    it("does not throw for missing key", async () => {
      cache = createCache();
      await expect(cache.delete("missing")).resolves.toBeUndefined();
    });
  });

  describe("clear", () => {
    it("removes all entries", async () => {
      cache = createCache();
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.clear();
      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBeUndefined();
    });
  });

  describe("has", () => {
    it("returns true for existing key", async () => {
      cache = createCache();
      await cache.set("key1", "value1");
      const result = await cache.has("key1");
      expect(result).toBe(true);
    });

    it("returns false for missing key", async () => {
      cache = createCache();
      const result = await cache.has("missing");
      expect(result).toBe(false);
    });

    it("returns false for expired key", async () => {
      cache = createCache({ defaultTtlSeconds: 60 });
      await cache.set("key1", "value1");

      vi.advanceTimersByTime(61 * 1000);

      const result = await cache.has("key1");
      expect(result).toBe(false);
    });
  });

  describe("getOrSet", () => {
    it("returns cached value if exists", async () => {
      cache = createCache();
      await cache.set("key1", "cached");
      const factory = vi.fn().mockResolvedValue("fresh");
      const result = await cache.getOrSet("key1", factory);
      expect(result).toBe("cached");
      expect(factory).not.toHaveBeenCalled();
    });

    it("calls factory and caches result if missing", async () => {
      cache = createCache();
      const factory = vi.fn().mockResolvedValue("fresh");
      const result = await cache.getOrSet("key1", factory);
      expect(result).toBe("fresh");
      expect(factory).toHaveBeenCalledTimes(1);
      expect(await cache.get("key1")).toBe("fresh");
    });

    it("respects custom TTL in getOrSet", async () => {
      cache = createCache({ defaultTtlSeconds: 60 });
      const factory = vi.fn().mockResolvedValue("fresh");
      await cache.getOrSet("key1", factory, 5);

      vi.advanceTimersByTime(4 * 1000);
      expect(await cache.get("key1")).toBe("fresh");

      vi.advanceTimersByTime(2 * 1000);
      expect(await cache.get("key1")).toBeUndefined();
    });

    it("deduplicates concurrent calls to getOrSet", async () => {
      cache = createCache();
      const factory = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return "value";
      });

      const resultPromise = Promise.all([
        cache.getOrSet("key1", factory),
        cache.getOrSet("key1", factory),
        cache.getOrSet("key1", factory),
      ]);

      await vi.advanceTimersByTimeAsync(50);

      const [r1, r2, r3] = await resultPromise;

      expect(r1).toBe("value");
      expect(r2).toBe("value");
      expect(r3).toBe("value");
      expect(factory).toHaveBeenCalledTimes(1);
    });
  });

  describe("stats", () => {
    it("tracks hits and misses", async () => {
      cache = createCache();
      await cache.set("key1", "value1");

      await cache.get("key1");
      await cache.get("key1");
      await cache.get("missing");

      const stats = cache.stats;
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
    });

    it("tracks size", async () => {
      cache = createCache();
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      expect(cache.stats.size).toBe(2);
      await cache.delete("key1");
      expect(cache.stats.size).toBe(1);
    });

    it("tracks evictions", async () => {
      cache = createCache({ maxEntries: 2 });
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.set("key3", "value3");
      expect(cache.stats.evictions).toBe(1);
    });
  });

  describe("maxEntries", () => {
    it("evicts oldest entry when max is reached", async () => {
      cache = createCache({ maxEntries: 2 });
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.set("key3", "value3");

      expect(await cache.get("key1")).toBeUndefined();
      expect(await cache.get("key2")).toBe("value2");
      expect(await cache.get("key3")).toBe("value3");
    });

    it("LRU updates on access", async () => {
      cache = createCache({ maxEntries: 2 });
      await cache.set("key1", "value1");
      await cache.set("key2", "value2");
      await cache.get("key1");
      await cache.set("key3", "value3");

      expect(await cache.get("key1")).toBe("value1");
      expect(await cache.get("key2")).toBeUndefined();
    });
  });
});
