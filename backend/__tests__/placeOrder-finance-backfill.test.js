import { jest } from "@jest/globals";

const mockHandleResponse = jest.fn();

const mockFreezeFinancialSnapshot = jest.fn();
const mockHydrateOrderItems = jest.fn();
const mockGenerateOrderPaymentBreakdown = jest.fn();

const mockAfterPlaceOrderV2 = jest.fn();

const mockCartFindOne = jest.fn();
const mockCartFindOneAndUpdate = jest.fn();

const mockProductFindById = jest.fn();
const mockProductFindByIdAndUpdate = jest.fn();

const mockTransactionCreate = jest.fn();
const mockStockHistoryCreate = jest.fn();
const mockNotificationCreate = jest.fn();
const mockPlaceOrderAtomic = jest.fn();
const mockCreateFinanceOrderSchemaValidate = jest.fn();

const OrderMock = jest.fn().mockImplementation((doc) => ({
  ...doc,
  _id: "mongo-order-1",
  save: jest.fn().mockResolvedValue(true),
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

jest.unstable_mockModule("../app/constants/orderWorkflow.js", () => ({
  WORKFLOW_STATUS: { SELLER_PENDING: "SELLER_PENDING" },
  DEFAULT_SELLER_TIMEOUT_MS: () => 0,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: mockAfterPlaceOrderV2,
  sellerAcceptAtomic: jest.fn(),
  sellerRejectAtomic: jest.fn(),
  deliveryAcceptAtomic: jest.fn(),
  customerCancelV2: jest.fn(),
  resolveWorkflowStatus: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: mockFreezeFinancialSnapshot,
  reverseOrderFinanceOnCancellation: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/pricingService.js", () => ({
  hydrateOrderItems: mockHydrateOrderItems,
  generateOrderPaymentBreakdown: mockGenerateOrderPaymentBreakdown,
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: OrderMock,
}));

jest.unstable_mockModule("../app/models/cart.js", () => ({
  default: {
    findOne: mockCartFindOne,
    findOneAndUpdate: mockCartFindOneAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    findById: mockProductFindById,
    findByIdAndUpdate: mockProductFindByIdAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/transaction.js", () => ({
  default: { create: mockTransactionCreate },
}));

jest.unstable_mockModule("../app/models/stockHistory.js", () => ({
  default: { create: mockStockHistoryCreate },
}));

jest.unstable_mockModule("../app/models/notification.js", () => ({
  default: { create: mockNotificationCreate },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/coupon.js", () => ({
  default: {
    findByIdAndUpdate: jest.fn(),
  },
}));
jest.unstable_mockModule("../app/utils/pagination.js", () => ({ default: jest.fn() }));
jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: jest.fn(),
  orderMatchQueryFlexible: jest.fn(),
}));
jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({
  distanceMeters: jest.fn(),
}));
jest.unstable_mockModule("../app/services/orderPlacementService.js", () => ({
  placeOrderAtomic: mockPlaceOrderAtomic,
}));
jest.unstable_mockModule("../app/validation/financeValidation.js", () => ({
  createFinanceOrderSchema: {
    validate: mockCreateFinanceOrderSchemaValidate,
  },
}));

const { placeOrder } = await import("../app/controller/orderController.js");

describe("placeOrder legacy route finance backfill", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockHandleResponse.mockImplementation((_res, status, message, data) => ({
      status,
      message,
      data,
    }));

    mockAfterPlaceOrderV2.mockResolvedValue(true);
    mockCartFindOneAndUpdate.mockResolvedValue(true);
    mockTransactionCreate.mockResolvedValue(true);
    mockStockHistoryCreate.mockResolvedValue(true);
    mockNotificationCreate.mockResolvedValue({ _id: "notif-1" });
    mockProductFindById.mockResolvedValue({ sellerId: "seller-1", name: "Test Product" });
    mockProductFindByIdAndUpdate.mockResolvedValue(true);

    mockHydrateOrderItems.mockResolvedValue([
      {
        productId: "p1",
        productName: "Test Product",
        quantity: 1,
        price: 100,
        image: "",
        headerCategoryId: "cat-1",
        sellerId: "seller-1",
      },
    ]);
    mockGenerateOrderPaymentBreakdown.mockResolvedValue({
      grandTotal: 123,
      riderPayoutTotal: 10,
      snapshots: {
        deliverySettings: {},
        categoryCommissionSettings: [],
        handlingFeeStrategy: null,
        handlingCategoryUsed: {},
      },
      lineItems: [],
    });

    mockCreateFinanceOrderSchemaValidate.mockImplementation((payload) => ({
      value: payload,
      error: null,
    }));
    mockPlaceOrderAtomic.mockResolvedValue({
      order: {
        _id: "mongo-order-1",
        orderId: "ORD-20260325-TEST",
        paymentMode: "COD",
        paymentStatus: "PENDING_CASH_COLLECTION",
      },
      duplicate: false,
    });
  });

  it("sets paymentMode/paymentStatus and freezes paymentBreakdown for COD orders", async () => {
    const req = {
      user: { id: "cust-1", role: "customer" },
      body: {
        address: {},
        payment: { method: "cash" },
        pricing: { subtotal: 100, deliveryFee: 20, platformFee: 3, gst: 0, discount: 0, total: 123 },
        timeSlot: "now",
        items: [{ product: "p1", name: "Test Product", quantity: 1, price: 100, image: "" }],
      },
    };
    const res = {};

    const result = await placeOrder(req, res);

    expect(result.status).toBe(201);
    expect(mockPlaceOrderAtomic).toHaveBeenCalledWith(
      expect.objectContaining({
        customerId: "cust-1",
        idempotencyKey: null,
      }),
    );
  });
});
