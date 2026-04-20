import { jest } from "@jest/globals";

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
};
const mockStartSession = jest.fn().mockResolvedValue(mockSession);

const mockCartFindOne = jest.fn();
const mockCustomerFindById = jest.fn();
const mockCouponFindByIdAndUpdate = jest.fn();
const mockCheckoutGroupFindOne = jest.fn();
const mockCheckoutGroupSave = jest.fn();
const mockOrderFind = jest.fn();
const mockTransactionCreate = jest.fn();
const mockReserveStockForItems = jest.fn();
const mockBuildCheckoutPricingSnapshot = jest.fn();
const mockGenerateUniqueCheckoutGroupId = jest.fn();
const mockGenerateUniquePublicOrderId = jest.fn();
const mockAfterPlaceOrderV2 = jest.fn();
const mockStoreIdempotencyResult = jest.fn();
const mockStoreIdempotencyError = jest.fn();
const mockReleaseIdempotencyLock = jest.fn();
const mockAcquireIdempotencyLock = jest.fn();
const mockCheckIdempotency = jest.fn();
const mockValidateIdempotencyKey = jest.fn();

let orderSequence = 0;

const CheckoutGroupMock = jest.fn().mockImplementation((doc) => ({
  ...doc,
  _id: "checkout-group-oid",
  save: mockCheckoutGroupSave,
  toObject() {
    return { ...this };
  },
}));
CheckoutGroupMock.findOne = mockCheckoutGroupFindOne;

const OrderMock = jest.fn().mockImplementation((doc) => {
  orderSequence += 1;
  return {
    ...doc,
    _id: `order-${orderSequence}`,
    save: jest.fn().mockResolvedValue(true),
    toObject() {
      return { ...this };
    },
  };
});
OrderMock.find = mockOrderFind;
OrderMock.findOne = jest.fn();

jest.unstable_mockModule("mongoose", () => ({
  default: {
    startSession: mockStartSession,
  },
}));

jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: {
    findById: mockCustomerFindById,
  },
}));

jest.unstable_mockModule("../app/models/coupon.js", () => ({
  default: {
    findByIdAndUpdate: mockCouponFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/cart.js", () => ({
  default: {
    findOne: mockCartFindOne,
  },
}));

jest.unstable_mockModule("../app/models/checkoutGroup.js", () => ({
  default: CheckoutGroupMock,
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: OrderMock,
}));

jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: {
    create: mockTransactionCreate,
  },
}));

jest.unstable_mockModule("../app/services/checkoutPricingService.js", () => ({
  buildCheckoutPricingSnapshot: mockBuildCheckoutPricingSnapshot,
}));

jest.unstable_mockModule("../app/services/stockService.js", () => ({
  computeStockReservationWindow: jest.fn(() => ({
    status: "RESERVED",
    reservedAt: new Date("2026-03-29T00:00:00.000Z"),
    expiresAt: new Date("2026-03-29T00:15:00.000Z"),
    releasedAt: null,
  })),
  reserveStockForItems: mockReserveStockForItems,
}));

jest.unstable_mockModule("../app/services/orderIdService.js", () => ({
  generateUniqueCheckoutGroupId: mockGenerateUniqueCheckoutGroupId,
  generateUniquePublicOrderId: mockGenerateUniquePublicOrderId,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: jest.fn((order, breakdown) => {
    order.paymentBreakdown = breakdown;
    order.pricing = {
      total: breakdown.grandTotal || 0,
    };
    return order;
  }),
}));

jest.unstable_mockModule("../app/services/idempotencyService.js", () => ({
  checkIdempotency: mockCheckIdempotency,
  acquireIdempotencyLock: mockAcquireIdempotencyLock,
  storeIdempotencyResult: mockStoreIdempotencyResult,
  storeIdempotencyError: mockStoreIdempotencyError,
  releaseIdempotencyLock: mockReleaseIdempotencyLock,
  isRetryableError: jest.fn((error) => Boolean(error?.retryable)),
  validateIdempotencyKey: mockValidateIdempotencyKey,
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
}));

const { placeOrderAtomic } = await import("../app/services/orderPlacementService.js");

function mockLean(value) {
  return {
    lean: jest.fn().mockResolvedValue(value),
  };
}

describe("checkout atomic service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    orderSequence = 0;
    mockCheckoutGroupSave.mockResolvedValue(true);
    mockTransactionCreate.mockResolvedValue([]);
    mockGenerateUniqueCheckoutGroupId.mockResolvedValue("CHK-01JSRTEST0000000000000000");
    mockGenerateUniquePublicOrderId
      .mockResolvedValueOnce("ORD-01JSRTEST0000000000000001")
      .mockResolvedValueOnce("ORD-01JSRTEST0000000000000002");
    mockCheckIdempotency.mockResolvedValue({
      exists: false,
      inProgress: false,
      checksumMismatch: false,
    });
    mockAcquireIdempotencyLock.mockResolvedValue(true);
    mockValidateIdempotencyKey.mockReturnValue(true);
    mockCheckoutGroupFindOne.mockReturnValue(mockLean(null));
    OrderMock.findOne.mockReturnValue(mockLean(null));
    mockOrderFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([]),
      }),
    });
    mockCartFindOne.mockResolvedValue(null);
    mockCustomerFindById.mockReturnValue({
      session: jest.fn().mockResolvedValue({
        _id: "67f0000000000000000000c1",
        walletBalance: 0,
      }),
    });
    mockCouponFindByIdAndUpdate.mockReturnValue({
      catch: jest.fn(),
    });
    mockReserveStockForItems.mockResolvedValue(undefined);
    mockBuildCheckoutPricingSnapshot.mockResolvedValue({
      sellerCount: 1,
      itemCount: 1,
      aggregateBreakdown: {
        currency: "INR",
        grandTotal: 120,
        productSubtotal: 100,
        deliveryFeeCharged: 20,
        handlingFeeCharged: 0,
        discountTotal: 0,
        taxTotal: 0,
        sellerPayoutTotal: 90,
        adminProductCommissionTotal: 10,
        riderPayoutTotal: 10,
        platformTotalEarning: 20,
        lineItems: [],
        snapshots: {},
      },
      sellerBreakdownEntries: [
        {
          sellerId: "67f000000000000000000001",
          distanceKm: 1.2,
          items: [
            {
              productId: "67f000000000000000000011",
              productName: "Apple",
              quantity: 1,
              price: 100,
              image: "https://cdn.test/apple.png",
            },
          ],
          breakdown: {
            currency: "INR",
            grandTotal: 120,
            productSubtotal: 100,
            deliveryFeeCharged: 20,
            handlingFeeCharged: 0,
            discountTotal: 0,
            taxTotal: 0,
            sellerPayoutTotal: 90,
            adminProductCommissionTotal: 10,
            riderPayoutTotal: 10,
            platformTotalEarning: 20,
            lineItems: [],
            snapshots: {},
          },
        },
      ],
    });
  });

  test("rolls back full checkout transaction when stock reservation fails", async () => {
    const stockError = Object.assign(new Error("Insufficient stock"), { statusCode: 409 });
    mockReserveStockForItems.mockRejectedValueOnce(stockError);

    await expect(
      placeOrderAtomic({
        customerId: "67f0000000000000000000c1",
        payload: {
          items: [{ product: "67f000000000000000000011", quantity: 2, price: 1 }],
          address: { city: "Indore" },
          paymentMode: "ONLINE",
        },
        idempotencyKey: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockSession.startTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.abortTransaction).toHaveBeenCalledTimes(1);
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
  });

  test("returns existing checkout for duplicate idempotency retry without creating new orders", async () => {
    mockCheckoutGroupFindOne.mockReturnValue(
      mockLean({
        _id: "group-1",
        checkoutGroupId: "CHK-01JSRTESTDUPLICATEGROUP0001",
        customer: "67f0000000000000000000c1",
      }),
    );
    mockOrderFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: "order-1",
            orderId: "ORD-01JSRTESTDUPLICATEORDER0001",
            checkoutGroupId: "CHK-01JSRTESTDUPLICATEGROUP0001",
          },
        ]),
      }),
    });

    const result = await placeOrderAtomic({
      customerId: "67f0000000000000000000c1",
      payload: {
        items: [{ product: "67f000000000000000000011", quantity: 1 }],
        address: { city: "Indore" },
        paymentMode: "ONLINE",
      },
      idempotencyKey: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    });

    expect(result.duplicate).toBe(true);
    expect(result.checkoutGroup.checkoutGroupId).toBe("CHK-01JSRTESTDUPLICATEGROUP0001");
    expect(result.orders).toHaveLength(1);
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  test("creates one checkout group with multiple seller child orders in one checkout", async () => {
    mockBuildCheckoutPricingSnapshot.mockResolvedValueOnce({
      sellerCount: 2,
      itemCount: 3,
      aggregateBreakdown: {
        currency: "INR",
        grandTotal: 310,
        productSubtotal: 260,
        deliveryFeeCharged: 50,
        handlingFeeCharged: 0,
        discountTotal: 0,
        taxTotal: 0,
        sellerPayoutTotal: 220,
        adminProductCommissionTotal: 40,
        riderPayoutTotal: 30,
        platformTotalEarning: 80,
        lineItems: [],
        snapshots: {},
      },
      sellerBreakdownEntries: [
        {
          sellerId: "67f000000000000000000001",
          distanceKm: 1,
          items: [
            { productId: "p1", productName: "A", quantity: 1, price: 100, image: "u1" },
          ],
          breakdown: {
            currency: "INR",
            grandTotal: 120,
            productSubtotal: 100,
            deliveryFeeCharged: 20,
            handlingFeeCharged: 0,
            discountTotal: 0,
            taxTotal: 0,
            sellerPayoutTotal: 90,
            adminProductCommissionTotal: 10,
            riderPayoutTotal: 10,
            platformTotalEarning: 20,
            lineItems: [],
            snapshots: {},
          },
        },
        {
          sellerId: "67f000000000000000000002",
          distanceKm: 2,
          items: [
            { productId: "p2", productName: "B", quantity: 2, price: 80, image: "u2" },
          ],
          breakdown: {
            currency: "INR",
            grandTotal: 190,
            productSubtotal: 160,
            deliveryFeeCharged: 30,
            handlingFeeCharged: 0,
            discountTotal: 0,
            taxTotal: 0,
            sellerPayoutTotal: 130,
            adminProductCommissionTotal: 30,
            riderPayoutTotal: 20,
            platformTotalEarning: 60,
            lineItems: [],
            snapshots: {},
          },
        },
      ],
    });

    const result = await placeOrderAtomic({
      customerId: "67f0000000000000000000c1",
      payload: {
        items: [
          { product: "p1", quantity: 1 },
          { product: "p2", quantity: 2 },
        ],
        address: { city: "Indore" },
        paymentMode: "ONLINE",
      },
      idempotencyKey: null,
    });

    expect(result.duplicate).toBe(false);
    expect(result.checkoutGroup.checkoutGroupId).toBe("CHK-01JSRTEST0000000000000000");
    expect(result.orders).toHaveLength(2);
    expect(result.orders[0].checkoutGroupId).toBe("CHK-01JSRTEST0000000000000000");
    expect(result.orders[1].checkoutGroupId).toBe("CHK-01JSRTEST0000000000000000");
    expect(result.orders[0].checkoutGroupIndex).toBe(0);
    expect(result.orders[1].checkoutGroupIndex).toBe(1);
    expect(mockTransactionCreate).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ reference: "ORD-01JSRTEST0000000000000001" }),
        expect.objectContaining({ reference: "ORD-01JSRTEST0000000000000002" }),
      ]),
      expect.objectContaining({ session: mockSession }),
    );
  });
});
