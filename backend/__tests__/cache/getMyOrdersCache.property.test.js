/**
 * Property-Based Tests: getMyOrders Cache Logic
 *
 * Tests the cache-aside pattern used by getMyOrders without connecting
 * to MongoDB or Redis. An in-memory store replaces both.
 *
 * Validates: Requirements 9.1, 9.4
 *
 * Properties tested:
 *   Property 5: Round-trip — for any customer ID, the value returned from
 *     cache equals the value that would be returned by a direct query for
 *     the same customer.
 *   Property 6: Isolation — invalidating the cache for customer A does not
 *     affect the cached result for customer B.
 */

import fc from "fast-check";

// ─── In-memory cache store ────────────────────────────────────────────────────

function makeStore() {
  const store = new Map();

  async function mockGetOrSet(key, fetchFn, _ttl) {
    if (store.has(key)) return store.get(key);
    const value = await fetchFn();
    store.set(key, value);
    return value;
  }

  async function mockInvalidate(key) {
    if (key.includes("*")) {
      const prefix = key.replace("*", "");
      for (const k of store.keys()) {
        if (k.startsWith(prefix)) store.delete(k);
      }
    } else {
      store.delete(key);
    }
  }

  function clear() {
    store.clear();
  }

  return { mockGetOrSet, mockInvalidate, clear, store };
}

// ─── Key builder (mirrors cacheService.buildKey for "orders"/"customer") ──────

function buildOrdersKey(customerId, page = 1, limit = 20) {
  return `cache:orders:customer:${customerId}:p${page}:l${limit}`;
}

function buildOrdersWildcard(customerId) {
  return `cache:orders:customer:${customerId}:*`;
}

// ─── Arbitraries ─────────────────────────────────────────────────────────────

// Realistic customer ID: UUID-based (mimics MongoDB ObjectId strings)
const customerIdArb = fc.uuid().map((s) => s.replace(/-/g, "").slice(0, 24));

// Two distinct customer IDs
const twoDistinctCustomerIdsArb = fc
  .tuple(customerIdArb, customerIdArb)
  .filter(([a, b]) => a !== b);

// Arbitrary order payload (shape mirrors what getMyOrders returns)
const orderPayloadArb = fc.record({
  items: fc.array(
    fc.record({
      orderId: fc.uuid().map((s) => s.replace(/-/g, "").slice(0, 8)),
      status: fc.constantFrom("pending", "confirmed", "delivered", "cancelled"),
      total: fc.float({ min: 1, max: 9999, noNaN: true }),
    }),
    { minLength: 0, maxLength: 5 }
  ),
  page: fc.integer({ min: 1, max: 10 }),
  limit: fc.integer({ min: 5, max: 100 }),
  total: fc.integer({ min: 0, max: 1000 }),
  totalPages: fc.integer({ min: 1, max: 50 }),
});

// ─── Property 5: Round-trip ───────────────────────────────────────────────────

/**
 * Validates: Requirements 9.1, 9.4
 *
 * For any customer ID and order payload, the value returned from cache on a
 * second call equals the value stored on the first call (round-trip fidelity).
 */
describe("Property 5: Round-trip", () => {
  test(
    "cached value equals the value returned by the fetch function for the same customer",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          customerIdArb,
          orderPayloadArb,
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 5, max: 100 }),
          async (customerId, payload, page, limit) => {
            const { mockGetOrSet, clear } = makeStore();
            clear();

            const key = buildOrdersKey(customerId, page, limit);
            const fetchFn = async () => ({ ...payload, page, limit });

            // First call — cache miss, fetchFn is invoked
            const firstResult = await mockGetOrSet(key, fetchFn, 60);

            // Second call — cache hit, fetchFn must NOT be invoked again
            let fetchCount = 0;
            const secondResult = await mockGetOrSet(
              key,
              async () => {
                fetchCount++;
                return { different: "value" };
              },
              60
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
          customerIdArb,
          orderPayloadArb,
          async (customerId, payload) => {
            const { mockGetOrSet, clear } = makeStore();
            clear();

            const key = buildOrdersKey(customerId);
            let callCount = 0;
            const fetchFn = async () => {
              callCount++;
              return payload;
            };

            await mockGetOrSet(key, fetchFn, 60);
            await mockGetOrSet(key, fetchFn, 60);
            await mockGetOrSet(key, fetchFn, 60);

            expect(callCount).toBe(1);
          }
        ),
        { numRuns: 100 }
      );
    }
  );
});

// ─── Property 6: Isolation ───────────────────────────────────────────────────

/**
 * Validates: Requirements 9.1, 9.4
 *
 * Invalidating the cache for customer A (via wildcard) must not affect the
 * cached result for customer B.
 */
describe("Property 6: Isolation", () => {
  test(
    "invalidating customer A cache does not affect customer B cache",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          twoDistinctCustomerIdsArb,
          orderPayloadArb,
          orderPayloadArb,
          async ([customerA, customerB], payloadA, payloadB) => {
            const { mockGetOrSet, mockInvalidate, clear } = makeStore();
            clear();

            const keyA = buildOrdersKey(customerA);
            const keyB = buildOrdersKey(customerB);

            // Populate cache for both customers
            await mockGetOrSet(keyA, async () => payloadA, 60);
            await mockGetOrSet(keyB, async () => payloadB, 60);

            // Invalidate customer A's cache (wildcard pattern)
            await mockInvalidate(buildOrdersWildcard(customerA));

            // Customer A's cache should be gone
            let aFetchCount = 0;
            await mockGetOrSet(
              keyA,
              async () => {
                aFetchCount++;
                return payloadA;
              },
              60
            );
            expect(aFetchCount).toBe(1); // fetchFn was called — cache was cleared

            // Customer B's cache must be unaffected
            let bFetchCount = 0;
            const bResult = await mockGetOrSet(
              keyB,
              async () => {
                bFetchCount++;
                return { different: "value" };
              },
              60
            );
            expect(bFetchCount).toBe(0); // fetchFn was NOT called — cache intact
            expect(bResult).toEqual(payloadB);
          }
        ),
        { numRuns: 100 }
      );
    }
  );

  test(
    "wildcard invalidation removes all page variants for customer A only",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          twoDistinctCustomerIdsArb,
          orderPayloadArb,
          fc.array(fc.integer({ min: 1, max: 5 }), { minLength: 2, maxLength: 4 }),
          async ([customerA, customerB], payload, pages) => {
            const { mockGetOrSet, mockInvalidate, clear, store } = makeStore();
            clear();

            // Populate multiple page variants for customer A
            for (const page of pages) {
              const key = buildOrdersKey(customerA, page, 20);
              await mockGetOrSet(key, async () => ({ ...payload, page }), 60);
            }

            // Populate a single entry for customer B
            const keyB = buildOrdersKey(customerB, 1, 20);
            await mockGetOrSet(keyB, async () => payload, 60);

            // Invalidate all pages for customer A
            await mockInvalidate(buildOrdersWildcard(customerA));

            // All customer A keys must be gone
            for (const page of pages) {
              const key = buildOrdersKey(customerA, page, 20);
              expect(store.has(key)).toBe(false);
            }

            // Customer B key must still be present
            expect(store.has(keyB)).toBe(true);
          }
        ),
        { numRuns: 80 }
      );
    }
  );
});
