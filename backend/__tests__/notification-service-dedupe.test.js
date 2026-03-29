import { jest } from "@jest/globals";

const mockRedisSet = jest.fn();
const mockNotificationCreate = jest.fn();
const mockDeliverNotificationById = jest.fn();
const mockFindPreference = jest.fn();

jest.unstable_mockModule("../app/modules/notifications/notification.model.js", () => ({
  default: {
    create: mockNotificationCreate,
    updateOne: jest.fn(),
  },
}));

jest.unstable_mockModule("../app/modules/notifications/preference.model.js", () => ({
  default: {
    findOneAndUpdate: mockFindPreference,
  },
}));

jest.unstable_mockModule("../app/modules/notifications/notification.builder.js", () => ({
  buildNotification: jest.fn(() => [
    {
      userId: "67f000000000000000000001",
      role: "customer",
      recipient: "67f000000000000000000001",
      recipientModel: "Customer",
      type: "ORDER_PLACED",
      title: "Order Placed",
      body: "Your order has been placed successfully.",
      message: "Your order has been placed successfully.",
      data: { orderId: "ORD-1", link: "/orders/ORD-1" },
      channel: "push",
      provider: "fcm",
    },
  ]),
}));

jest.unstable_mockModule("../app/modules/notifications/notification.worker.js", () => ({
  deliverNotificationById: mockDeliverNotificationById,
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: () => ({
    set: mockRedisSet,
  }),
}));

jest.unstable_mockModule("../app/services/logger.js", () => ({
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.unstable_mockModule("../app/services/metrics.js", () => ({
  incrementCounter: jest.fn(),
  setGauge: jest.fn(),
}));

const { notify } = await import("../app/modules/notifications/notification.service.js");

describe("notification service deduplication", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedisSet
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce(null);
    mockNotificationCreate.mockResolvedValue({
      _id: "notif-1",
      userId: "67f000000000000000000001",
      role: "customer",
    });
    mockDeliverNotificationById.mockResolvedValue(undefined);
    mockFindPreference.mockReturnValue({
      lean: jest.fn().mockResolvedValue({
        orderUpdates: true,
        deliveryUpdates: true,
        promotions: false,
      }),
    });
  });

  test("prevents duplicate enqueue for same dedupe key", async () => {
    await notify("ORDER_PLACED", {
      orderId: "ORD-1",
      userId: "67f000000000000000000001",
    });
    await notify("ORDER_PLACED", {
      orderId: "ORD-1",
      userId: "67f000000000000000000001",
    });

    expect(mockRedisSet).toHaveBeenCalledTimes(2);
    expect(mockNotificationCreate).toHaveBeenCalledTimes(1);
    expect(mockDeliverNotificationById).toHaveBeenCalledTimes(1);
  });
});
