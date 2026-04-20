import { jest } from "@jest/globals";

const mockPlaceOrderAtomic = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {},
}));
jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {},
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  handleCodOrderFinance: jest.fn(),
  reconcileCodCash: jest.fn(),
  settleDeliveredOrder: jest.fn(),
}));

jest.unstable_mockModule("../app/services/orderPlacementService.js", () => ({
  placeOrderAtomic: mockPlaceOrderAtomic,
}));

jest.unstable_mockModule("../app/services/paymentService.js", () => ({
  verifyClientPaymentCallback: jest.fn(),
}));

jest.unstable_mockModule("../app/services/checkoutPricingService.js", () => ({
  buildCheckoutPricingSnapshot: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: jest.fn(),
}));

const { createOrderWithFinancialSnapshot } = await import(
  "../app/controller/orderFinanceController.js"
);

describe("orderFinanceController server-authoritative payload", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPlaceOrderAtomic.mockResolvedValue({
      duplicate: false,
      order: { orderId: "ORD-01JSRAAAAAAAATEST0000001" },
      orders: [{ orderId: "ORD-01JSRAAAAAAAATEST0000001" }],
      checkoutGroup: { checkoutGroupId: "CHK-01JSRAAAAAAAATEST0000001" },
    });
  });

  test("ignores client pricing/tax/discount tampering when constructing checkout payload", async () => {
    const req = {
      user: { id: "67f0000000000000000000c1" },
      headers: {},
      body: {
        items: [
          {
            product: "67f000000000000000000011",
            quantity: 2,
            price: 1,
          },
        ],
        address: {
          city: "Indore",
          location: { lat: 22.72, lng: 75.86 },
        },
        paymentMode: "ONLINE",
        timeSlot: "now",
        discountTotal: 99999,
        taxTotal: 99999,
        pricing: {
          subtotal: 1,
          total: 1,
          gst: 0,
          discount: 99999,
        },
      },
    };
    const res = {};

    await createOrderWithFinancialSnapshot(req, res);

    expect(mockPlaceOrderAtomic).toHaveBeenCalledTimes(1);
    const callArg = mockPlaceOrderAtomic.mock.calls[0][0];
    expect(callArg.customerId).toBe("67f0000000000000000000c1");
    expect(callArg.payload.discountTotal).toBeUndefined();
    expect(callArg.payload.taxTotal).toBeUndefined();
    expect(callArg.payload.pricing).toBeUndefined();
    expect(callArg.payload.paymentMode).toBe("ONLINE");
    expect(mockHandleResponse).toHaveBeenCalledWith(
      res,
      201,
      "Order created with financial snapshot",
      expect.objectContaining({
        paymentRef: "ORD-01JSRAAAAAAAATEST0000001",
      }),
    );
  });
});
