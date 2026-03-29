/**
 * Phase 2 - Pagination Property-Based Tests
 *
 * Properties tested:
 *   Property 21: Pagination Parameter Handling
 *   Property 22: Pagination Response Structure
 *   Property 23: Limit Clamping
 *   Property 24: Cursor Pagination Response Structure
 *   Property 25: Skip Limit Validation
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const {
  getPagination,
  buildPaginationMetadata,
  parseCursor,
  encodeCursor,
  buildCursorPaginationMetadata,
  validatePaginationParams,
} = await import("../app/utils/pagination.js");

function makeReq(page, limit) {
  return { query: { page: String(page), limit: String(limit) } };
}

// ─── Property 21 ─────────────────────────────────────────────────────────────

describe("Property 21: Pagination Parameter Handling", () => {
  test("valid page and limit are applied correctly", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (page, limit) => {
          const result = getPagination(makeReq(page, limit));
          expect(result.page).toBe(page);
          expect(result.limit).toBe(limit);
          expect(result.skip).toBe((page - 1) * limit);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("defaults to page=1, limit=20 when params missing", () => {
    const result = getPagination({ query: {} });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
    expect(result.skip).toBe(0);
  });

  test("non-numeric params fall back to defaults", () => {
    const result = getPagination({ query: { page: "abc", limit: "xyz" } });
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });
});

// ─── Property 22 ─────────────────────────────────────────────────────────────

describe("Property 22: Pagination Response Structure", () => {
  test("buildPaginationMetadata returns all required fields", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (total, page, limit) => {
          const meta = buildPaginationMetadata(total, { page, limit });
          expect(meta).toHaveProperty("page", page);
          expect(meta).toHaveProperty("limit", limit);
          expect(meta).toHaveProperty("totalPages");
          expect(meta).toHaveProperty("totalCount", total);
          expect(meta).toHaveProperty("hasMore");
          expect(meta.totalPages).toBeGreaterThanOrEqual(1);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("hasMore is true only when more pages exist", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (total, page, limit) => {
          const meta = buildPaginationMetadata(total, { page, limit });
          const totalPages = Math.ceil(total / limit) || 1;
          expect(meta.hasMore).toBe(page < totalPages);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 23 ─────────────────────────────────────────────────────────────

describe("Property 23: Limit Clamping", () => {
  test("limit > 100 is clamped to 100", () => {
    fc.assert(
      fc.property(fc.integer({ min: 101, max: 10000 }), (limit) => {
        const result = getPagination(makeReq(1, limit));
        expect(result.limit).toBe(100);
      }),
      { numRuns: 100 }
    );
  });

  test("limit within range is not clamped", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (limit) => {
        const result = getPagination(makeReq(1, limit));
        expect(result.limit).toBe(limit);
      }),
      { numRuns: 100 }
    );
  });

  test("custom maxLimit is respected", () => {
    fc.assert(
      fc.property(fc.integer({ min: 51, max: 200 }), (limit) => {
        const result = getPagination(makeReq(1, limit), { maxLimit: 50 });
        expect(result.limit).toBeLessThanOrEqual(50);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 24 ─────────────────────────────────────────────────────────────

describe("Property 24: Cursor Pagination Response Structure", () => {
  test("encodeCursor produces valid base64", () => {
    fc.assert(
      fc.property(
        fc.record({ _id: fc.uuid(), createdAt: fc.date() }),
        (item) => {
          const cursor = encodeCursor(item);
          expect(typeof cursor).toBe("string");
          expect(() => Buffer.from(cursor, "base64").toString("utf-8")).not.toThrow();
        }
      ),
      { numRuns: 100 }
    );
  });

  test("parseCursor decodes what encodeCursor produces", () => {
    fc.assert(
      fc.property(
        fc.record({ _id: fc.uuid(), createdAt: fc.date() }),
        (item) => {
          const cursor = encodeCursor(item);
          const decoded = parseCursor(cursor);
          expect(decoded.id).toBe(item._id.toString());
        }
      ),
      { numRuns: 100 }
    );
  });

  test("buildCursorPaginationMetadata returns correct shape", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        fc.integer({ min: 1, max: 100 }),
        (limit, itemCount) => {
          const items = Array.from({ length: itemCount }, (_, i) => ({
            _id: `id-${i}`,
            createdAt: new Date(),
          }));
          const meta = buildCursorPaginationMetadata(items, limit);
          expect(meta).toHaveProperty("hasMore");
          expect(meta).toHaveProperty("nextCursor");
          expect(meta).toHaveProperty("count", itemCount);
          if (itemCount === limit) {
            expect(meta.hasMore).toBe(true);
            expect(meta.nextCursor).not.toBeNull();
          } else {
            expect(meta.hasMore).toBe(false);
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 25 ─────────────────────────────────────────────────────────────

describe("Property 25: Skip Limit Validation", () => {
  test("valid page/limit within skip limit do not throw", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 500 }),
        fc.integer({ min: 1, max: 100 }),
        (page, limit) => {
          const skip = (page - 1) * limit;
          if (skip <= 1_000_000) {
            expect(() => getPagination(makeReq(page, limit))).not.toThrow();
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("throws when skip exceeds 1,000,000", () => {
    expect(() => getPagination(makeReq(10002, 100))).toThrow();
  });

  test("validatePaginationParams throws on invalid params", () => {
    expect(() => validatePaginationParams({ page: 0, limit: 20, skip: 0 })).toThrow();
    expect(() => validatePaginationParams({ page: 1, limit: 0, skip: 0 })).toThrow();
    expect(() => validatePaginationParams({ page: 1, limit: 200, skip: 0 })).toThrow();
    expect(() => validatePaginationParams({ page: 1, limit: 20, skip: 2_000_000 })).toThrow();
  });

  test("validatePaginationParams passes for valid params", () => {
    expect(() => validatePaginationParams({ page: 1, limit: 20, skip: 0 })).not.toThrow();
    expect(() => validatePaginationParams({ page: 5, limit: 100, skip: 400 })).not.toThrow();
  });
});
