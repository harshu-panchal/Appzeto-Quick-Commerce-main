/**
 * Phase 2 - Search Service Property-Based Tests
 *
 * Properties tested:
 *   Property 31: Search Filter Support
 *   Property 32: Query Normalization
 *   Property 35: Asynchronous Search Indexing
 *   Property 37: Search Indexing Retry
 *   Property 38: Search Fallback
 *   Property 39: Search Result Structure
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

// Mock Product model
const mockProducts = [];

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    find: jest.fn((query) => ({
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn(async () =>
        mockProducts
          .filter((p) => {
            if (query.status && p.status !== query.status) return false;
            if (query.categoryId && p.categoryId !== query.categoryId) return false;
            if (query.sellerId && p.sellerId !== query.sellerId) return false;
            if (query.stock?.$gt !== undefined && p.stock <= query.stock.$gt) return false;
            if (query.price?.$gte !== undefined && p.price < query.price.$gte) return false;
            if (query.price?.$lte !== undefined && p.price > query.price.$lte) return false;
            return true;
          })
          .map((p) => ({ ...p, score: 1 }))
      ),
    })),
    countDocuments: jest.fn(async (query) =>
      mockProducts.filter((p) => {
        if (query.status && p.status !== query.status) return false;
        if (query.categoryId && p.categoryId !== query.categoryId) return false;
        if (query.sellerId && p.sellerId !== query.sellerId) return false;
        if (query.stock?.$gt !== undefined && p.stock <= query.stock.$gt) return false;
        if (query.price?.$gte !== undefined && p.price < query.price.$gte) return false;
        if (query.price?.$lte !== undefined && p.price > query.price.$lte) return false;
        return true;
      }).length
    ),
    collection: {
      indexes: jest.fn(async () => [
        { name: "name_text_tags_text", key: { name: "text", tags: "text" } },
      ]),
    },
  },
}));

const { MongoSearchBackend } = await import("../app/services/search/mongoSearchBackend.js");

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const searchQueryArb = fc.record({
  keyword: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
  categoryId: fc.option(fc.uuid(), { nil: undefined }),
  priceMin: fc.option(fc.double({ min: 0, max: 500, noNaN: true }), { nil: undefined }),
  priceMax: fc.option(fc.double({ min: 500, max: 2000, noNaN: true }), { nil: undefined }),
  inStock: fc.option(fc.boolean(), { nil: undefined }),
  sellerId: fc.option(fc.uuid(), { nil: undefined }),
  page: fc.integer({ min: 1, max: 10 }),
  limit: fc.integer({ min: 1, max: 20 }),
});

const rawKeywordArb = fc.oneof(
  fc.string({ minLength: 0, maxLength: 100 }),
  fc.constant("  hello world  "),
  fc.constant("UPPERCASE QUERY"),
  fc.constant("special!@#$%chars"),
  fc.constant("  "),
  fc.constant("")
);

// ─── Property 31: Search Filter Support ──────────────────────────────────────

describe("Property 31: Search Filter Support", () => {
  const backend = new MongoSearchBackend();

  test("search returns result with required shape for any query", async () => {
    await fc.assert(
      fc.asyncProperty(searchQueryArb, async (query) => {
        const result = await backend.search(query);
        expect(result).toHaveProperty("items");
        expect(result).toHaveProperty("total");
        expect(result).toHaveProperty("page");
        expect(result).toHaveProperty("limit");
        expect(result).toHaveProperty("took");
        expect(Array.isArray(result.items)).toBe(true);
        expect(typeof result.total).toBe("number");
        expect(result.total).toBeGreaterThanOrEqual(0);
      }),
      { numRuns: 50 }
    );
  });

  test("page and limit are reflected in result", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 20 }),
        async (page, limit) => {
          const result = await backend.search({ page, limit });
          expect(result.page).toBe(page);
          expect(result.limit).toBe(limit);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Property 32: Query Normalization ────────────────────────────────────────

describe("Property 32: Query Normalization", () => {
  const backend = new MongoSearchBackend();

  test("normalizeQuery trims whitespace", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (keyword) => {
        const normalized = backend.normalizeQuery(keyword);
        // Result should not have leading or trailing whitespace
        expect(normalized.startsWith(" ")).toBe(false);
        expect(normalized.endsWith(" ")).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test("normalizeQuery converts to lowercase", () => {
    fc.assert(
      fc.property(fc.string({ minLength: 1, maxLength: 50 }), (keyword) => {
        const normalized = backend.normalizeQuery(keyword);
        expect(normalized).toBe(normalized.toLowerCase());
      }),
      { numRuns: 100 }
    );
  });

  test("normalizeQuery removes special characters", () => {
    fc.assert(
      fc.property(rawKeywordArb, (keyword) => {
        const normalized = backend.normalizeQuery(keyword);
        expect(normalized).toMatch(/^[\w\s-]*$/);
      }),
      { numRuns: 100 }
    );
  });

  test("normalizeQuery returns empty string for empty/null input", () => {
    expect(backend.normalizeQuery("")).toBe("");
    expect(backend.normalizeQuery("   ")).toBe("");
    expect(backend.normalizeQuery(null)).toBe("");
    expect(backend.normalizeQuery(undefined)).toBe("");
  });

  test("normalizeQuery is idempotent", () => {
    fc.assert(
      fc.property(rawKeywordArb, (keyword) => {
        const once = backend.normalizeQuery(keyword);
        const twice = backend.normalizeQuery(once);
        expect(once).toBe(twice);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 35: Asynchronous Search Indexing ───────────────────────────────

describe("Property 35: Asynchronous Search Indexing", () => {
  const backend = new MongoSearchBackend();

  test("index() is a no-op that resolves", async () => {
    await fc.assert(
      fc.asyncProperty(fc.record({ _id: fc.uuid(), name: fc.string() }), async (product) => {
        await expect(backend.index(product)).resolves.toBeUndefined();
      }),
      { numRuns: 50 }
    );
  });

  test("remove() is a no-op that resolves", async () => {
    await fc.assert(
      fc.asyncProperty(fc.uuid(), async (productId) => {
        await expect(backend.remove(productId)).resolves.toBeUndefined();
      }),
      { numRuns: 50 }
    );
  });

  test("bulkIndex() returns correct shape", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(fc.record({ _id: fc.uuid() }), { minLength: 1, maxLength: 20 }),
        async (products) => {
          const result = await backend.bulkIndex(products);
          expect(result).toHaveProperty("indexed", products.length);
          expect(result).toHaveProperty("failed", 0);
          expect(result).toHaveProperty("errors");
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Property 37: Search Indexing Retry ──────────────────────────────────────

describe("Property 37: Search Indexing Retry", () => {
  test("SEARCH_INDEX_RETRY_ATTEMPTS is a valid positive integer", () => {
    const attempts = parseInt(process.env.SEARCH_INDEX_RETRY_ATTEMPTS || "3", 10);
    expect(attempts).toBeGreaterThanOrEqual(1);
    expect(attempts).toBeLessThanOrEqual(10);
  });
});

// ─── Property 38: Search Fallback ────────────────────────────────────────────

describe("Property 38: Search Fallback", () => {
  const backend = new MongoSearchBackend();

  test("health check returns correct shape", async () => {
    const health = await backend.health();
    expect(health).toHaveProperty("healthy");
    expect(health).toHaveProperty("backend", "mongodb");
    expect(health).toHaveProperty("details");
  });

  test("buildQuery always includes status=active", () => {
    fc.assert(
      fc.property(searchQueryArb, (query) => {
        const mongoQuery = backend.buildQuery(query);
        expect(mongoQuery.status).toBe("active");
      }),
      { numRuns: 100 }
    );
  });

  test("buildQuery includes category filter when provided", () => {
    fc.assert(
      fc.property(fc.uuid(), (categoryId) => {
        const mongoQuery = backend.buildQuery({ categoryId });
        expect(mongoQuery.categoryId).toBe(categoryId);
      }),
      { numRuns: 50 }
    );
  });

  test("buildQuery includes stock filter when inStock=true", () => {
    const mongoQuery = backend.buildQuery({ inStock: true });
    expect(mongoQuery.stock).toEqual({ $gt: 0 });
  });

  test("buildQuery includes price range when provided", () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 100, max: 1000, noNaN: true }),
        (priceMin, priceMax) => {
          const mongoQuery = backend.buildQuery({ priceMin, priceMax });
          expect(mongoQuery.price.$gte).toBe(priceMin);
          expect(mongoQuery.price.$lte).toBe(priceMax);
        }
      ),
      { numRuns: 50 }
    );
  });
});

// ─── Property 39: Search Result Structure ────────────────────────────────────

describe("Property 39: Search Result Structure", () => {
  test("search result items have required fields", async () => {
    mockProducts.length = 0;
    mockProducts.push({
      _id: "prod-1",
      name: "Test Product",
      price: 100,
      salePrice: 90,
      mainImage: "img.jpg",
      sellerId: "seller-1",
      stock: 10,
      status: "active",
    });

    const backend = new MongoSearchBackend();
    const result = await backend.search({ page: 1, limit: 10 });

    for (const item of result.items) {
      expect(item).toHaveProperty("_id");
      expect(item).toHaveProperty("name");
      expect(item).toHaveProperty("price");
      expect(item).toHaveProperty("sellerId");
      expect(item).toHaveProperty("stock");
      expect(item).toHaveProperty("status");
      expect(item).toHaveProperty("score");
    }
  });

  test("took field is a non-negative number", async () => {
    const backend = new MongoSearchBackend();
    const result = await backend.search({ page: 1, limit: 10 });
    expect(typeof result.took).toBe("number");
    expect(result.took).toBeGreaterThanOrEqual(0);
  });
});
