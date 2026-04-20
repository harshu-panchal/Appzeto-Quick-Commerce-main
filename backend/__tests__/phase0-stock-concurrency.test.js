import { jest } from "@jest/globals";

const mockProductFindOneAndUpdate = jest.fn();
const mockStockHistoryCreate = jest.fn();

jest.unstable_mockModule("../app/models/product.js", () => ({
  default: {
    findOneAndUpdate: mockProductFindOneAndUpdate,
  },
}));

jest.unstable_mockModule("../app/models/stockHistory.js", () => ({
  default: {
    create: mockStockHistoryCreate,
  },
}));

const { reserveStockForItems } = await import("../app/services/stockService.js");

describe("Phase 0 stock concurrency safety", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    let invocation = 0;
    mockProductFindOneAndUpdate.mockImplementation(async () => {
      invocation += 1;
      if (invocation === 1) {
        return { _id: "product-1", stock: 0 };
      }
      return null;
    });
    mockStockHistoryCreate.mockResolvedValue([]);
  });

  it("allows only one reservation under concurrent pressure and blocks oversell", async () => {
    const payload = {
      items: [
        {
          productId: "product-1",
          productName: "Apple",
          quantity: 1,
        },
      ],
      sellerId: "seller-1",
      orderId: "ORD-CONCUR-1",
      paymentMode: "ONLINE",
    };

    const [r1, r2] = await Promise.allSettled([
      reserveStockForItems(payload),
      reserveStockForItems(payload),
    ]);

    const successCount = [r1, r2].filter((r) => r.status === "fulfilled").length;
    const failCount = [r1, r2].filter((r) => r.status === "rejected").length;

    expect(successCount).toBe(1);
    expect(failCount).toBe(1);
    expect(mockProductFindOneAndUpdate).toHaveBeenCalledTimes(2);
    expect(mockStockHistoryCreate).toHaveBeenCalledTimes(1);
  });
});
