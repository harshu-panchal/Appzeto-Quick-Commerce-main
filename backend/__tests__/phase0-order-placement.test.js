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
const mockOrderFindOne = jest.fn();
const mockTransactionCreate = jest.fn();
const mockGenerateUniqueCheckoutGroupId = jest.fn();
const mockGenerateUniquePublicOrderId = jest.fn();
const mockBuildCheckoutPricingSnapshot = jest.fn();
const mockReserveStockForItems = jest.fn();
const mockStoreIdempotencyResult = jest.fn();
const mockStoreIdempotencyError = jest.fn();
const mockReleaseIdempotencyLock = jest.fn();
const mockCheckIdempotency = jest.fn();
const mockAcquireIdempotencyLock = jest.fn();
const mockValidateIdempotencyKey = jest.fn();

let sequence = 0;

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
  sequence += 1;
  return {
    ...doc,
    _id: `order-${sequence}`,
    save: jest.fn().mockResolvedValue(true),
    toObject() {
      return { ...this };
    },
  };
});
OrderMock.find = mockOrderFind;
OrderMock.findOne = mockOrderFindOne;

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

jest.unstable_mockModule("../app/services/orderIdService.js", () => ({
  generateUniqueCheckoutGroupId: mockGenerateUniqueCheckoutGroupId,
  generateUniquePublicOrderId: mockGenerateUniquePublicOrderId,
}));

jest.unstable_mockModule("../app/services/checkoutPricingService.js", () => ({
  buildCheckoutPricingSnapshot: mockBuildCheckoutPricingSnapshot,
}));

jest.unstable_mockModule("../app/services/stockService.js", () => ({
  computeStockReservationWindow: jest.fn(() => ({
    status: "RESERVED",
    reservedAt: new Date("2026-03-29T00:00:00.000Z"),
    expiresAt: new Date("2026-03-29T00:10:00.000Z"),
    releasedAt: null,
  })),
  reserveStockForItems: mockReserveStockForItems,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: jest.fn((order, breakdown) => {
    order.paymentBreakdown = breakdown;
    order.pricing = { total: breakdown.grandTotal || 0 };
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

describe("Phase 0 atomic order placement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequence = 0;

    mockCheckoutGroupSave.mockResolvedValue(true);
    mockTransactionCreate.mockResolvedValue([]);
    mockGenerateUniqueCheckoutGroupId.mockResolvedValue("CHK-01JSRPHASE0000000000000000");
    mockGenerateUniquePublicOrderId.mockResolvedValue("ORD-01JSRPHASE0000000000000001");
    mockCheckIdempotency.mockResolvedValue({
      exists: false,
      inProgress: false,
      checksumMismatch: false,
    });
    mockAcquireIdempotencyLock.mockResolvedValue(true);
    mockValidateIdempotencyKey.mockReturnValue(true);
    mockCheckoutGroupFindOne.mockReturnValue(mockLean(null));
    mockOrderFindOne.mockReturnValue(mockLean(null));
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

  it("returns existing order for duplicate idempotency key", async () => {
    mockCheckoutGroupFindOne.mockReturnValue(
      mockLean({
        _id: "group-1",
        checkoutGroupId: "CHK-01JSRPHASEDUPLICATE00000001",
        customer: "67f0000000000000000000c1",
      }),
    );
    mockOrderFind.mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue([
          {
            _id: "order-1",
            orderId: "ORD-01JSRPHASEDUPLICATE00000001",
            checkoutGroupId: "CHK-01JSRPHASEDUPLICATE00000001",
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
      idempotencyKey: "cccccccccccccccccccccccccccccccc",
    });

    expect(result.duplicate).toBe(true);
    expect(result.order.orderId).toBe("ORD-01JSRPHASEDUPLICATE00000001");
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it("aborts transaction fully when stock reservation fails", async () => {
    mockReserveStockForItems.mockRejectedValueOnce(
      Object.assign(new Error("Insufficient stock"), { statusCode: 409 }),
    );

    await expect(
      placeOrderAtomic({
        customerId: "67f0000000000000000000c1",
        payload: {
          items: [{ product: "67f000000000000000000011", quantity: 5 }],
          address: { city: "Indore" },
          paymentMode: "ONLINE",
        },
        idempotencyKey: "dddddddddddddddddddddddddddddddd",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockSession.startTransaction).toHaveBeenCalled();
    expect(mockSession.abortTransaction).toHaveBeenCalled();
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockTransactionCreate).not.toHaveBeenCalled();
  });
});
