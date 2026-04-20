/**
 * Phase 2 - Cache Service Property-Based Tests
 *
 * Properties tested:
 *   Property 26: Cache Check Before Database Query
 *   Property 27: Cache-Aside Pattern
 *   Property 28: Cache Invalidation on Update
 *   Property 29: Cache Key Namespacing
 *   Property 30: Cache Error Fallback
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

// ─── Mock Redis ───────────────────────────────────────────────────────────────

const mockStore = new Map();
const mockPublish = jest.fn();

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: () => ({
    get: jest.fn(async (key) => mockStore.get(key) ?? null),
    setex: jest.fn(async (key, _ttl, value) => {
      mockStore.set(key, value);
      return "OK";
    }),
    del: jest.fn(async (...keys) => {
      keys.flat(Infinity).filter(k => typeof k === "string").forEach((k) => mockStore.delete(k));
      return 1;
    }),
    scan: jest.fn(async (cursor, _match, pattern, _count, _n) => {
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      const matching = [...mockStore.keys()].filter((k) => regex.test(k));
      return ["0", matching];
    }),
    publish: mockPublish,
  }),
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const { get, set, del, getOrSet, invalidate, buildKey, delPattern } =
  await import("../app/services/cacheService.js");

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const cacheKeyArb = fc
  .tuple(
    fc.constantFrom("categories", "settings", "product", "delivery", "homepage"),
    fc.constantFrom("tree", "platform", "rules", "collections"),
    fc.option(fc.uuid(), { nil: undefined })
  )
  .map(([svc, entity, id]) => buildKey(svc, entity, id || ""));

const jsonValueArb = fc.oneof(
  fc.string(),
  fc.integer(),
  fc.boolean(),
  fc.record({ id: fc.uuid(), name: fc.string() })
);

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockStore.clear();
  mockPublish.mockClear();
});

// ─── Property 26: Cache Check Before Database Query ──────────────────────────

describe("Property 26: Cache Check Before Database Query", () => {
  test("get returns null on cache miss", async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, async (key) => {
        mockStore.clear();
        const result = await get(key);
        expect(result).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  test("get returns stored value on cache hit", async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, jsonValueArb, async (key, value) => {
        mockStore.clear();
        await set(key, value, 300);
        const result = await get(key);
        expect(result).toEqual(value);
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 27: Cache-Aside Pattern ────────────────────────────────────────

describe("Property 27: Cache-Aside Pattern", () => {
  test("getOrSet calls fetchFn on cache miss and caches result", async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, jsonValueArb, async (key, value) => {
        mockStore.clear();
        const fetchFn = jest.fn(async () => value);

        const result = await getOrSet(key, fetchFn, 300);
        expect(fetchFn).toHaveBeenCalledTimes(1);
        expect(result).toEqual(value);

        // Second call should use cache
        const result2 = await getOrSet(key, fetchFn, 300);
        expect(fetchFn).toHaveBeenCalledTimes(1); // Not called again
        expect(result2).toEqual(value);
      }),
      { numRuns: 50 }
    );
  });

  test("getOrSet does not call fetchFn on cache hit", async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, jsonValueArb, async (key, value) => {
        mockStore.clear();
        await set(key, value, 300);

        const fetchFn = jest.fn(async () => ({ different: "value" }));
        const result = await getOrSet(key, fetchFn, 300);

        expect(fetchFn).not.toHaveBeenCalled();
        expect(result).toEqual(value);
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 28: Cache Invalidation on Update ───────────────────────────────

describe("Property 28: Cache Invalidation on Update", () => {
  test("del removes key from cache", async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, jsonValueArb, async (key, value) => {
        mockStore.clear();
        await set(key, value, 300);
        expect(await get(key)).toEqual(value);

        await del(key);
        expect(await get(key)).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  test("invalidate removes key and publishes event", async () => {
    await fc.assert(
      fc.asyncProperty(cacheKeyArb, jsonValueArb, async (key, value) => {
        mockStore.clear();
        mockPublish.mockClear();
        await set(key, value, 300);

        await invalidate(key);

        expect(await get(key)).toBeNull();
        expect(mockPublish).toHaveBeenCalledWith(
          "cache:invalidate",
          expect.stringContaining(key)
        );
      }),
      { numRuns: 50 }
    );
  });

  test("delPattern removes all matching keys", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uuid(),
        fc.array(jsonValueArb, { minLength: 2, maxLength: 5 }),
        async (prefix, values) => {
          mockStore.clear();
          const keys = values.map((_, i) => `cache:test:item:${prefix}-${i}`);
          for (let i = 0; i < keys.length; i++) {
            await set(keys[i], values[i], 300);
          }

          await delPattern(`cache:test:item:${prefix}-*`);

          for (const key of keys) {
            expect(await get(key)).toBeNull();
          }
        }
      ),
      { numRuns: 30 }
    );
  });
});

// ─── Property 29: Cache Key Namespacing ──────────────────────────────────────

describe("Property 29: Cache Key Namespacing", () => {
  test("buildKey produces correctly namespaced keys", () => {
    fc.assert(
      fc.property(
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes(":")),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes(":")),
        fc.string({ minLength: 1, maxLength: 20 }).filter(s => !s.includes(":")),
        (service, entity, id) => {
          const key = buildKey(service, entity, id);
          expect(key).toBe(`cache:${service}:${entity}:${id}`);
          expect(key.startsWith("cache:")).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("buildKey without identifier omits trailing segment", () => {
    const key = buildKey("categories", "tree");
    expect(key).toBe("cache:categories:tree");
  });
});

// ─── Property 30: Cache Error Fallback ───────────────────────────────────────

describe("Property 30: Cache Error Fallback", () => {
  test("get returns null (not throws) when Redis errors", async () => {
    // Temporarily make the mock throw
    const { getRedisClient } = await import("../app/config/redis.js");
    getRedisClient().get.mockRejectedValueOnce(new Error("Redis timeout"));

    const result = await get("cache:test:error-key");
    expect(result).toBeNull(); // Graceful fallback
  });

  test("getOrSet falls back to fetchFn when Redis get throws", async () => {
    const { getRedisClient } = await import("../app/config/redis.js");
    getRedisClient().get.mockRejectedValueOnce(new Error("Redis connection lost"));

    const fetchFn = jest.fn(async () => ({ fallback: true }));
    const result = await getOrSet("cache:test:fallback", fetchFn, 300);

    expect(result).toEqual({ fallback: true });
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });
});
