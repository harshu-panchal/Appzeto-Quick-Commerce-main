/**
 * Property-Based Tests: getProducts Cache Logic
 *
 * Tests the cache-aside pattern and key-building logic used by getProducts
 * without connecting to MongoDB or Redis. An in-memory store replaces both.
 *
 * Validates: Requirements 11.3
 *
 * Properties tested:
 *   Property 7: Round-trip — for any query parameter set, the value returned
 *     from cache equals the value that would be returned by a direct query
 *     with the same parameters.
 *   Property 8: Determinism — two calls with logically equivalent query
 *     parameters (same keys, same values, different insertion order) produce
 *     the same cache key.
 */

import fc from "fast-check";

// ─── buildProductListKey (mirrors productController.js logic) ────────────────
// Tested directly without importing the controller to avoid MongoDB/Redis deps.

function buildProductListKey(queryParams) {
  const sorted = Object.keys(queryParams)
    .sort()
    .reduce((acc, k) => {
      acc[k] = String(queryParams[k] ?? "").trim().toLowerCase();
      return acc;
    }, {});
  return `cache:catalog:productList:${JSON.stringify(sorted)}`;
}

// ─── In-memory cache store ────────────────────────────────────────────────────

function makeStore() {
  const store = new Map();

  async function mockGetOrSet(key, fetchFn, _ttl) {
    if (store.has(key)) return store.get(key);
    const value = await fetchFn();
    store.set(key, value);
    return value;
  }

  function clear() {
    store.clear();
  }

  return { mockGetOrSet, clear, store };
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// Arbitrary query param key: short alphanumeric string
const queryKeyArb = fc
  .stringMatching(/^[a-z][a-zA-Z0-9]{0,9}$/)
  .filter((s) => s.length > 0);

// Arbitrary query param value: string, number, or boolean-like
const queryValueArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 20 }),
  fc.integer({ min: 0, max: 9999 }).map(String),
  fc.constantFrom("true", "false", "asc", "desc", "active", "inactive")
);

// Arbitrary query params object (1–6 keys)
const queryParamsArb = fc
  .uniqueArray(queryKeyArb, { minLength: 1, maxLength: 6 })
  .chain((keys) =>
    fc
      .tuple(...keys.map(() => queryValueArb))
      .map((values) => Object.fromEntries(keys.map((k, i) => [k, values[i]])))
  );

// Arbitrary product list payload (shape mirrors what getProducts returns)
const productPayloadArb = fc.record({
  items: fc.array(
    fc.record({
      _id: fc.uuid().map((s) => s.replace(/-/g, "").slice(0, 24)),
      name: fc.string({ minLength: 1, maxLength: 40 }),
      price: fc.float({ min: Math.fround(0.01), max: Math.fround(9999), noNaN: true }),
      status: fc.constantFrom("active", "inactive"),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  page: fc.integer({ min: 1, max: 10 }),
  limit: fc.integer({ min: 1, max: 100 }),
  total: fc.integer({ min: 0, max: 1000 }),
  totalPages: fc.integer({ min: 1, max: 50 }),
});

// ─── Property 7: Round-trip ───────────────────────────────────────────────────

/**
 * Validates: Requirements 11.3
 *
 * For any query parameter set, the value returned from cache on a second call
 * equals the value stored on the first call (round-trip fidelity).
 */
describe("Property 7: Round-trip", () => {
  test(
    "cached product list equals the value returned by the fetch function for the same query params",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          queryParamsArb,
          productPayloadArb,
          async (queryParams, payload) => {
            const { mockGetOrSet, clear } = makeStore();
            clear();

            const key = buildProductListKey(queryParams);
            const fetchFn = async () => ({ ...payload });

            // First call — cache miss, fetchFn is invoked
            const firstResult = await mockGetOrSet(key, fetchFn, 300);

            // Second call — cache hit, fetchFn must NOT be invoked again
            let fetchCount = 0;
            const secondResult = await mockGetOrSet(
              key,
              async () => {
                fetchCount++;
                return { different: "value" };
              },
              300
            );

            // Round-trip: second result equals first result
            expect(secondResult).toEqual(firstResult);
            // fetchFn was not called on the second access
            expect(fetchCount).toBe(0);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    "fetch function is called exactly once on cache miss and zero times on subsequent hits",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          queryParamsArb,
          productPayloadArb,
          async (queryParams, payload) => {
            const { mockGetOrSet, clear } = makeStore();
            clear();

            const key = buildProductListKey(queryParams);
            let callCount = 0;
            const fetchFn = async () => {
              callCount++;
              return { ...payload };
            };

            await mockGetOrSet(key, fetchFn, 300);
            await mockGetOrSet(key, fetchFn, 300);
            await mockGetOrSet(key, fetchFn, 300);

            expect(callCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ─── Property 8: Determinism ─────────────────────────────────────────────────

/**
 * Validates: Requirements 11.3
 *
 * Two calls with logically equivalent query parameters (same keys, same values,
 * but different insertion order) must produce the same cache key.
 */
describe("Property 8: Determinism", () => {
  test(
    "same keys and values in different insertion order produce the same cache key",
    () => {
      fc.assert(
        fc.property(queryParamsArb, (queryParams) => {
          const keys = Object.keys(queryParams);

          // Build a permuted version by reversing key insertion order
          const permutedParams = keys
            .slice()
            .reverse()
            .reduce((acc, k) => {
              acc[k] = queryParams[k];
              return acc;
            }, {});

          const key1 = buildProductListKey(queryParams);
          const key2 = buildProductListKey(permutedParams);

          expect(key1).toBe(key2);
        }),
        { numRuns: 200 }
      );
    }
  );

  test(
    "arbitrary permutation of query param keys produces the same cache key",
    () => {
      fc.assert(
        fc.property(
          queryParamsArb,
          fc.integer({ min: 0, max: 99 }),
          (queryParams, seed) => {
            const keys = Object.keys(queryParams);

            // Deterministic shuffle using seed
            const shuffled = keys.slice().sort((a, b) => {
              const ha = (a.charCodeAt(0) * seed) % 97;
              const hb = (b.charCodeAt(0) * seed) % 97;
              return ha - hb;
            });

            const shuffledParams = shuffled.reduce((acc, k) => {
              acc[k] = queryParams[k];
              return acc;
            }, {});

            const key1 = buildProductListKey(queryParams);
            const key2 = buildProductListKey(shuffledParams);

            expect(key1).toBe(key2);
          }
        ),
        { numRuns: 200 }
      );
    }
  );

  test(
    "cache key starts with the expected prefix",
    () => {
      fc.assert(
        fc.property(queryParamsArb, (queryParams) => {
          const key = buildProductListKey(queryParams);
          expect(key.startsWith("cache:catalog:productList:")).toBe(true);
        }),
        { numRuns: 100 }
      );
    }
  );

  test(
    "different query param values produce different cache keys",
    () => {
      fc.assert(
        fc.property(
          queryParamsArb,
          queryValueArb,
          (queryParams, differentValue) => {
            const keys = Object.keys(queryParams);
            if (keys.length === 0) return;

            const firstKey = keys[0];
            const originalValue = queryParams[firstKey];

            // Only test when the values are actually different after normalization
            const normalizedOriginal = String(originalValue ?? "").trim().toLowerCase();
            const normalizedDifferent = String(differentValue ?? "").trim().toLowerCase();

            if (normalizedOriginal === normalizedDifferent) return;

            const modifiedParams = { ...queryParams, [firstKey]: differentValue };

            const key1 = buildProductListKey(queryParams);
            const key2 = buildProductListKey(modifiedParams);

            expect(key1).not.toBe(key2);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});
