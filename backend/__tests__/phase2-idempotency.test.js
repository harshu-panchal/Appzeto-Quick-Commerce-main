/**
 * Phase 2 - Idempotency Property-Based Tests
 *
 * Properties tested:
 *   Property 1: Idempotency Check Before Processing
 *   Property 2: Cached Result Returns Without Side Effects
 *   Property 3: Concurrent Request Conflict Detection
 *   Property 9: Payload Change Detection
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

// ─── Mock Redis store ─────────────────────────────────────────────────────────

const mockStore = new Map();

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: () => ({
    get: jest.fn(async (key) => mockStore.get(key) ?? null),
    set: jest.fn(async (key, value, mode, ttl, flag) => {
      if (flag === "NX" && mockStore.has(key)) return null;
      mockStore.set(key, value);
      return "OK";
    }),
    setex: jest.fn(async (key, _ttl, value) => {
      mockStore.set(key, value);
      return "OK";
    }),
    del: jest.fn(async (...keys) => {
      // Handle both del(key) and del(key1, key2, ...) forms
      const allKeys = keys.flat(Infinity).filter(k => typeof k === "string");
      allKeys.forEach((k) => mockStore.delete(k));
      return allKeys.length;
    }),
    exists: jest.fn(async (key) => (mockStore.has(key) ? 1 : 0)),
    publish: jest.fn(async () => 0),
  }),
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const {
  validateIdempotencyKey,
  checkIdempotency,
  acquireIdempotencyLock,
  storeIdempotencyResult,
  storeIdempotencyError,
  releaseIdempotencyLock,
  isRetryableError,
} = await import("../app/services/idempotencyService.js");

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const validKeyArb = fc
  .string({ minLength: 32, maxLength: 64 })
  .map((s) => s.replace(/[^a-zA-Z0-9-]/g, "a"))
  .filter((k) => k.length >= 32 && /^[a-zA-Z0-9-]{32,64}$/.test(k));

const payloadArb = fc.record({
  items: fc.array(
    fc.record({ productId: fc.uuid(), quantity: fc.integer({ min: 1, max: 10 }) }),
    { minLength: 1, maxLength: 5 }
  ),
  address: fc.record({ name: fc.string({ minLength: 1, maxLength: 50 }) }),
});

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => mockStore.clear());

// ─── Unit Tests ───────────────────────────────────────────────────────────────

describe("validateIdempotencyKey", () => {
  test("accepts valid 32-64 char alphanumeric keys", () => {
    expect(validateIdempotencyKey("a".repeat(32))).toBe(true);
    expect(validateIdempotencyKey("z".repeat(64))).toBe(true);
  });
  test("rejects too short or too long", () => {
    expect(validateIdempotencyKey("short")).toBe(false);
    expect(validateIdempotencyKey("a".repeat(65))).toBe(false);
  });
  test("rejects null/undefined/non-string", () => {
    expect(validateIdempotencyKey(null)).toBe(false);
    expect(validateIdempotencyKey(undefined)).toBe(false);
  });
});

describe("isRetryableError", () => {
  test("network errors are retryable", () => {
    const e = Object.assign(new Error("refused"), { code: "ECONNREFUSED" });
    expect(isRetryableError(e)).toBe(true);
  });
  test("5xx are retryable", () => {
    const e = Object.assign(new Error("server error"), { statusCode: 500 });
    expect(isRetryableError(e)).toBe(true);
  });
  test("4xx are non-retryable", () => {
    const e = Object.assign(new Error("bad request"), { statusCode: 400 });
    expect(isRetryableError(e)).toBe(false);
  });
});

// ─── Property 1: Idempotency Check Before Processing ─────────────────────────

describe("Property 1: Idempotency Check Before Processing", () => {
  test("new key returns exists=false, inProgress=false", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, payloadArb, async (key, payload) => {
        mockStore.clear();
        const result = await checkIdempotency(key, payload);
        expect(result.exists).toBe(false);
        expect(result.inProgress).toBe(false);
        expect(result.checksumMismatch).toBe(false);
      }),
      { numRuns: 50 }
    );
  });

  test("locked key returns inProgress=true", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, async (key) => {
        mockStore.clear();
        await acquireIdempotencyLock(key);
        const result = await checkIdempotency(key);
        expect(result.inProgress).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  test("stored result returns exists=true", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, payloadArb, async (key, payload) => {
        mockStore.clear();
        await storeIdempotencyResult(key, { orderId: "ORD-001" }, payload);
        const result = await checkIdempotency(key, payload);
        expect(result.exists).toBe(true);
        expect(result.inProgress).toBe(false);
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 2: Cached Result Returns Without Side Effects ──────────────────

describe("Property 2: Cached Result Returns Without Side Effects", () => {
  test("reading cached result does not add new keys to store", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, payloadArb, async (key, payload) => {
        mockStore.clear();
        await storeIdempotencyResult(key, { orderId: "ORD-CACHED" }, payload);
        const sizeBefore = mockStore.size;
        await checkIdempotency(key, payload);
        expect(mockStore.size).toBe(sizeBefore);
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 3: Concurrent Request Conflict Detection ───────────────────────

describe("Property 3: Concurrent Request Conflict Detection", () => {
  test("only one concurrent lock acquisition succeeds", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, async (key) => {
        mockStore.clear();
        const results = await Promise.all([
          acquireIdempotencyLock(key),
          acquireIdempotencyLock(key),
          acquireIdempotencyLock(key),
        ]);
        expect(results.filter(Boolean).length).toBe(1);
      }),
      { numRuns: 50 }
    );
  });

  test("lock release allows re-acquisition", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, async (key) => {
        mockStore.clear();
        expect(await acquireIdempotencyLock(key)).toBe(true);
        await releaseIdempotencyLock(key);
        expect(await acquireIdempotencyLock(key)).toBe(true);
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 9: Payload Change Detection ────────────────────────────────────

describe("Property 9: Payload Change Detection", () => {
  test("same key + different payload → checksumMismatch=true", async () => {
    mockStore.clear();
    const key = "a".repeat(32);
    const p1 = { items: [{ productId: "prod-1", quantity: 1 }], address: { name: "Alice" } };
    const p2 = { items: [{ productId: "prod-2", quantity: 2 }], address: { name: "Bob" } };

    await storeIdempotencyResult(key, { orderId: "ORD-001" }, p1);

    const resultKey = `idempotency:result:${key}`;
    const stored = mockStore.get(resultKey);
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored);
    // Checksum must be stored for mismatch detection to work
    expect(parsed.checksum).toBeTruthy();

    const result = await checkIdempotency(key, p2);
    expect(result.exists).toBe(true);
    // checksumMismatch is true when stored checksum differs from current payload checksum
    expect(result.checksumMismatch).toBe(true);
  });

  test("same key + same payload → checksumMismatch=false", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, payloadArb, async (key, payload) => {
        mockStore.clear();
        await storeIdempotencyResult(key, { orderId: "ORD-001" }, payload);
        const result = await checkIdempotency(key, payload);
        expect(result.checksumMismatch).toBe(false);
        expect(result.exists).toBe(true);
      }),
      { numRuns: 50 }
    );
  });

  test("non-retryable error is cached and returned on retry", async () => {
    await fc.assert(
      fc.asyncProperty(validKeyArb, payloadArb, async (key, payload) => {
        mockStore.clear();
        const err = Object.assign(new Error("Insufficient stock"), { statusCode: 400 });
        await storeIdempotencyError(key, err, payload);
        const result = await checkIdempotency(key, payload);
        expect(result.exists).toBe(true);
        expect(result.result.status).toBe("error");
      }),
      { numRuns: 50 }
    );
  });
});
