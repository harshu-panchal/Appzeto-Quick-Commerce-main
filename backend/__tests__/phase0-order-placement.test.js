import { jest } from "@jest/globals";

const mockSession = {
  startTransaction: jest.fn(),
  commitTransaction: jest.fn(),
  abortTransaction: jest.fn(),
  endSession: jest.fn(),
};
const mockStartSession = jest.fn().mockResolvedValue(mockSession);

const mockCartFindOne = jest.fn();
const mockCartFindOneAndUpdate = jest.fn();
const mockOrderFindOne = jest.fn();
const mockTransactionCreate = jest.fn();
const mockGenerateUniquePublicOrderId = jest.fn();
const mockHydrateOrderItems = jest.fn();
const mockGenerateOrderPaymentBreakdown = jest.fn();
const mockReserveStockForItems = jest.fn();
const mockAfterPlaceOrderV2 = jest.fn();
const mockFreezeFinancialSnapshot = jest.fn();

const mockOrderSave = jest.fn();
const OrderMock = jest.fn().mockImplementation((doc) => ({
  ...doc,
  _id: "order-mongo-id",
  save: mockOrderSave,
}));
OrderMock.findOne = mockOrderFindOne;

jest.unstable_mockModule("mongoose", () => ({
  default: {
    startSession: mockStartSession,
  },
}));

jest.unstable_mockModule("../app/models/cart.js", () => ({
  default: {
    findOne: mockCartFindOne,
    findOneAndUpdate: mockCartFindOneAndUpdate,
  },
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
  generateUniquePublicOrderId: mockGenerateUniquePublicOrderId,
}));

jest.unstable_mockModule("../app/services/finance/pricingService.js", () => ({
  hydrateOrderItems: mockHydrateOrderItems,
  generateOrderPaymentBreakdown: mockGenerateOrderPaymentBreakdown,
}));

jest.unstable_mockModule("../app/services/stockService.js", () => ({
  computeStockReservationWindow: jest.fn().mockReturnValue({
    status: "RESERVED",
    reservedAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    releasedAt: null,
  }),
  reserveStockForItems: mockReserveStockForItems,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: mockFreezeFinancialSnapshot,
}));

const { placeOrderAtomic } = await import("../app/services/orderPlacementService.js");

describe("Phase 0 atomic order placement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockSession.startTransaction.mockClear();
    mockSession.commitTransaction.mockClear();
    mockSession.abortTransaction.mockClear();
    mockSession.endSession.mockClear();
    mockOrderSave.mockResolvedValue(true);
    mockCartFindOneAndUpdate.mockResolvedValue({});
    mockTransactionCreate.mockResolvedValue([]);
    mockHydrateOrderItems.mockResolvedValue([
      {
        productId: "product-1",
        productName: "Apple",
        quantity: 2,
        price: 100,
        sellerId: "seller-1",
      },
    ]);
    mockGenerateOrderPaymentBreakdown.mockResolvedValue({
      grandTotal: 200,
      snapshots: {
        deliverySettings: {},
        categoryCommissionSettings: [],
        handlingFeeStrategy: null,
        handlingCategoryUsed: {},
      },
    });
    mockGenerateUniquePublicOrderId.mockResolvedValue("ORD-20260325-UNIQUEID");
  });

  it("returns existing order for duplicate idempotency key", async () => {
    mockOrderFindOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue({
        _id: "existing-order",
        orderId: "ORD-EXISTING",
      }),
    });

    const result = await placeOrderAtomic({
      customerId: "customer-1",
      payload: {
        items: [{ product: "product-1", quantity: 1 }],
        address: { city: "Indore" },
        paymentMode: "ONLINE",
      },
      idempotencyKey: "idem-123",
    });

    expect(result.duplicate).toBe(true);
    expect(result.order.orderId).toBe("ORD-EXISTING");
    expect(mockStartSession).not.toHaveBeenCalled();
  });

  it("aborts transaction fully when stock reservation fails", async () => {
    mockOrderFindOne.mockReturnValueOnce({
      lean: jest.fn().mockResolvedValue(null),
    });
    mockReserveStockForItems.mockRejectedValueOnce(
      Object.assign(new Error("Insufficient stock"), { statusCode: 409 }),
    );

    await expect(
      placeOrderAtomic({
        customerId: "customer-1",
        payload: {
          items: [{ product: "product-1", quantity: 5 }],
          address: { city: "Indore" },
          paymentMode: "ONLINE",
        },
        idempotencyKey: "idem-rollback",
      }),
    ).rejects.toMatchObject({ statusCode: 409 });

    expect(mockSession.startTransaction).toHaveBeenCalled();
    expect(mockSession.abortTransaction).toHaveBeenCalled();
    expect(mockSession.commitTransaction).not.toHaveBeenCalled();
    expect(mockOrderSave).not.toHaveBeenCalled();
    expect(mockCartFindOneAndUpdate).not.toHaveBeenCalled();
  });
});
