import { jest } from "@jest/globals";

const mockOrderFindOne = jest.fn();
const mockOrderFindById = jest.fn();

const mockApplyDeliveredSettlement = jest.fn();
const mockOrderMatchQueryFromRouteParam = jest.fn();
const mockHandleResponse = jest.fn();

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
    findById: mockOrderFindById,
  },
}));

jest.unstable_mockModule("../app/models/cart.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/product.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/transaction.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/stockHistory.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/notification.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/seller.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/delivery.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/setting.js", () => ({ default: {} }));
jest.unstable_mockModule("../app/models/customer.js", () => ({ default: {} }));

jest.unstable_mockModule("../app/services/orderSettlement.js", () => ({
  applyDeliveredSettlement: mockApplyDeliveredSettlement,
}));

jest.unstable_mockModule("../app/utils/orderLookup.js", () => ({
  orderMatchQueryFromRouteParam: mockOrderMatchQueryFromRouteParam,
  orderMatchQueryFlexible: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/helper.js", () => ({
  default: mockHandleResponse,
}));

jest.unstable_mockModule("../app/utils/pagination.js", () => ({
  default: jest.fn(),
}));

jest.unstable_mockModule("../app/constants/orderWorkflow.js", () => ({
  WORKFLOW_STATUS: {},
  DEFAULT_SELLER_TIMEOUT_MS: () => 0,
}));

jest.unstable_mockModule("../app/services/orderWorkflowService.js", () => ({
  afterPlaceOrderV2: jest.fn(),
  sellerAcceptAtomic: jest.fn(),
  sellerRejectAtomic: jest.fn(),
  deliveryAcceptAtomic: jest.fn(),
  customerCancelV2: jest.fn(),
  resolveWorkflowStatus: jest.fn(),
}));

jest.unstable_mockModule("../app/services/finance/orderFinanceService.js", () => ({
  freezeFinancialSnapshot: jest.fn((order) => order),
  reverseOrderFinanceOnCancellation: jest.fn(),
}));

jest.unstable_mockModule("../app/utils/geoUtils.js", () => ({
  distanceMeters: jest.fn(),
}));

const { updateOrderStatus } = await import("../app/controller/orderController.js");

describe("updateOrderStatus delivered finance ordering", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockOrderMatchQueryFromRouteParam.mockImplementation((id) => ({ orderId: id }));
    mockHandleResponse.mockImplementation((_res, status, message, data) => ({
      status,
      message,
      data,
    }));
  });

  it("persists delivered + deliveryBoy before settlement", async () => {
    const callOrder = [];
    const orderDoc = {
      _id: "mongo-1",
      orderId: "ORD1",
      status: "out_for_delivery",
      orderStatus: "out_for_delivery",
      workflowVersion: 1,
      deliveryBoy: "rider-old",
      seller: "seller-1",
      save: jest.fn().mockImplementation(async () => {
        callOrder.push("save");
      }),
    };

    mockOrderFindOne.mockResolvedValue(orderDoc);
    mockOrderFindById.mockResolvedValue({ ...orderDoc, paymentMode: "COD" });

    mockApplyDeliveredSettlement.mockImplementation(async () => {
      callOrder.push("settlement");
    });

    const req = {
      params: { orderId: "ORD1" },
      body: { status: "delivered", deliveryBoyId: "rider-1" },
      user: { id: "admin-1", role: "admin" },
    };
    const res = {};

    const result = await updateOrderStatus(req, res);

    expect(result.status).toBe(200);
    expect(orderDoc.deliveryBoy).toBe("rider-1");
    expect(orderDoc.status).toBe("delivered");
    expect(orderDoc.orderStatus).toBe("delivered");
    expect(orderDoc.save).toHaveBeenCalledTimes(1);

    expect(mockApplyDeliveredSettlement).toHaveBeenCalledWith(orderDoc, "ORD1");
    expect(callOrder).toEqual(["save", "settlement"]);
  });
});
