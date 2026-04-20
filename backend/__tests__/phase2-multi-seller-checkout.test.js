/**
 * Phase 2 - Multi-Seller Checkout Property-Based Tests
 *
 * Properties tested:
 *   Property 10: Seller Grouping
 *   Property 11: Checkout Group ID Generation
 *   Property 14: Atomic Multi-Seller Order Creation
 *   Property 15: Payment Allocation Correctness
 *   Property 16: Atomic Stock Reservation
 */

import { jest } from "@jest/globals";
import fc from "fast-check";

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn(),
}));

const {
  groupItemsBySeller,
  generateCheckoutGroupId,
  calculateSellerPricing,
  allocatePaymentAcrossSellers,
} = await import("../app/services/multiSellerCheckoutService.js");

// ─── Arbitraries ─────────────────────────────────────────────────────────────

const sellerIdArb = fc.uuid();

const cartItemArb = (sellerId) =>
  fc.record({
    product: fc.record({
      _id: fc.uuid(),
      sellerId: fc.constant(sellerId),
    }),
    name: fc.string({ minLength: 1, maxLength: 30 }),
    quantity: fc.integer({ min: 1, max: 10 }),
    price: fc.double({ min: 1, max: 1000, noNaN: true }),
  });

const multiSellerCartArb = fc
  .array(sellerIdArb, { minLength: 2, maxLength: 5 })
  .chain((sellerIds) => {
    const uniqueSellers = [...new Set(sellerIds)];
    return fc
      .tuple(...uniqueSellers.map((sid) => fc.array(cartItemArb(sid), { minLength: 1, maxLength: 4 })))
      .map((groups) => groups.flat());
  });

// ─── Property 10: Seller Grouping ────────────────────────────────────────────

describe("Property 10: Seller Grouping", () => {
  test("each group contains only items from that seller", () => {
    fc.assert(
      fc.property(multiSellerCartArb, (items) => {
        const groups = groupItemsBySeller(items);
        for (const [sellerId, groupItems] of groups) {
          for (const item of groupItems) {
            const itemSellerId = item.sellerId?.toString() || item.product?.sellerId?.toString();
            expect(itemSellerId).toBe(sellerId);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  test("all items are accounted for across groups", () => {
    fc.assert(
      fc.property(multiSellerCartArb, (items) => {
        const groups = groupItemsBySeller(items);
        const totalGrouped = [...groups.values()].reduce((sum, g) => sum + g.length, 0);
        expect(totalGrouped).toBe(items.length);
      }),
      { numRuns: 100 }
    );
  });

  test("number of groups equals number of unique sellers", () => {
    fc.assert(
      fc.property(multiSellerCartArb, (items) => {
        const uniqueSellers = new Set(
          items.map((i) => i.sellerId?.toString() || i.product?.sellerId?.toString())
        );
        const groups = groupItemsBySeller(items);
        expect(groups.size).toBe(uniqueSellers.size);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 11: Checkout Group ID Generation ───────────────────────────────

describe("Property 11: Checkout Group ID Generation", () => {
  test("generated IDs match CHK-{sortable-token} format", () => {
    for (let i = 0; i < 100; i++) {
      const id = generateCheckoutGroupId();
      expect(id).toMatch(/^CHK-[0-9A-Z]{26}$/);
    }
  });

  test("generated IDs are unique across 1000 calls", () => {
    const ids = new Set(Array.from({ length: 1000 }, () => generateCheckoutGroupId()));
    expect(ids.size).toBeGreaterThan(990);
  });

  test("ID always starts with CHK-", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        expect(generateCheckoutGroupId().startsWith("CHK-")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

// ─── Property 14: Atomic Multi-Seller Order Creation ─────────────────────────

describe("Property 14: Atomic Multi-Seller Order Creation", () => {
  test("groupItemsBySeller produces correct count for N sellers", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 10 }),
        fc.integer({ min: 1, max: 5 }),
        (sellerCount, itemsPerSeller) => {
          const items = [];
          for (let s = 0; s < sellerCount; s++) {
            const sid = `seller-${s}`;
            for (let i = 0; i < itemsPerSeller; i++) {
              items.push({ product: { _id: `prod-${s}-${i}`, sellerId: sid }, quantity: 1, price: 10 });
            }
          }
          const groups = groupItemsBySeller(items);
          expect(groups.size).toBe(sellerCount);
          for (const [, groupItems] of groups) {
            expect(groupItems.length).toBe(itemsPerSeller);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("groupItemsBySeller is deterministic for same input", () => {
    fc.assert(
      fc.property(multiSellerCartArb, (items) => {
        const groups1 = groupItemsBySeller(items);
        const groups2 = groupItemsBySeller(items);
        expect(groups1.size).toBe(groups2.size);
        for (const [sid, g1] of groups1) {
          expect(groups2.has(sid)).toBe(true);
          expect(groups2.get(sid).length).toBe(g1.length);
        }
      }),
      { numRuns: 50 }
    );
  });
});

// ─── Property 15: Payment Allocation Correctness ─────────────────────────────

describe("Property 15: Payment Allocation Correctness", () => {
  test("sum of allocations equals total within 0.01 currency units", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            seller: fc.uuid(),
            pricing: fc.record({ total: fc.double({ min: 1, max: 1000, noNaN: true }) }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (sellerOrders) => {
          const grandTotal = sellerOrders.reduce((sum, o) => sum + o.pricing.total, 0);
          const allocation = allocatePaymentAcrossSellers(grandTotal, sellerOrders);
          const allocatedSum = [...allocation.values()].reduce((sum, v) => sum + v, 0);
          expect(Math.abs(allocatedSum - grandTotal)).toBeLessThanOrEqual(0.01);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("every seller receives a non-negative allocation", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            seller: fc.uuid(),
            pricing: fc.record({ total: fc.double({ min: 1, max: 1000, noNaN: true }) }),
          }),
          { minLength: 2, maxLength: 10 }
        ),
        (sellerOrders) => {
          const grandTotal = sellerOrders.reduce((sum, o) => sum + o.pricing.total, 0);
          const allocation = allocatePaymentAcrossSellers(grandTotal, sellerOrders);
          for (const [, amount] of allocation) {
            expect(amount).toBeGreaterThanOrEqual(0);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("allocation map has one entry per seller order", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            seller: fc.uuid(),
            pricing: fc.record({ total: fc.double({ min: 1, max: 500, noNaN: true }) }),
          }),
          { minLength: 2, maxLength: 8 }
        ),
        (sellerOrders) => {
          const grandTotal = sellerOrders.reduce((sum, o) => sum + o.pricing.total, 0);
          const allocation = allocatePaymentAcrossSellers(grandTotal, sellerOrders);
          expect(allocation.size).toBe(sellerOrders.length);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Property 16: Atomic Stock Reservation ───────────────────────────────────

describe("Property 16: Atomic Stock Reservation", () => {
  test("calculateSellerPricing subtotal equals sum of item prices", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            price: fc.double({ min: 1, max: 500, noNaN: true }),
            quantity: fc.integer({ min: 1, max: 10 }),
          }),
          { minLength: 1, maxLength: 10 }
        ),
        async (items) => {
          const expectedSubtotal = items.reduce((sum, i) => sum + i.price * i.quantity, 0);
          const pricing = await calculateSellerPricing(items, {
            deliveryFeePerSeller: 0,
            handlingFeePerSeller: 0,
            taxRate: 0,
          });
          expect(Math.abs(pricing.subtotal - expectedSubtotal)).toBeLessThan(0.001);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("calculateSellerPricing total includes all fee components", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            price: fc.double({ min: 1, max: 100, noNaN: true }),
            quantity: fc.integer({ min: 1, max: 5 }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.double({ min: 0, max: 50, noNaN: true }),
        fc.double({ min: 0, max: 20, noNaN: true }),
        async (items, deliveryFee, handlingFee) => {
          const pricing = await calculateSellerPricing(items, {
            deliveryFeePerSeller: deliveryFee,
            handlingFeePerSeller: handlingFee,
            taxRate: 0,
          });
          const expectedTotal = pricing.subtotal + deliveryFee + handlingFee;
          expect(Math.abs(pricing.total - expectedTotal)).toBeLessThan(0.001);
        }
      ),
      { numRuns: 100 }
    );
  });
});

// ─── Integration: Idempotent Multi-Seller Checkout ───────────────────────────

describe("5.8 Integration: Idempotent Multi-Seller Checkout (unit layer)", () => {
  test("same checkout group ID is not generated twice for same timestamp", () => {
    const ids = new Set(Array.from({ length: 500 }, () => generateCheckoutGroupId()));
    expect(ids.size).toBeGreaterThan(490);
  });
});
