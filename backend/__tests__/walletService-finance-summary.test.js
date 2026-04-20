import { jest } from "@jest/globals";

const mockWalletFindOne = jest.fn();
const mockWalletCreate = jest.fn();

const mockOrderAggregate = jest.fn();
const mockPayoutAggregate = jest.fn();

jest.unstable_mockModule("../app/models/wallet.js", () => ({
  default: {
    findOne: mockWalletFindOne,
    create: mockWalletCreate,
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    aggregate: mockOrderAggregate,
  },
}));

jest.unstable_mockModule("../app/models/payout.js", () => ({
  default: {
    aggregate: mockPayoutAggregate,
  },
}));

const { getAdminFinanceSummary } = await import(
  "../app/services/finance/walletService.js"
);

describe("getAdminFinanceSummary", () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Admin wallet exists with some available balance
    mockWalletFindOne.mockResolvedValue({
      ownerType: "ADMIN",
      ownerId: null,
      availableBalance: 999,
      pendingBalance: 0,
      cashInHand: 0,
      totalCredited: 0,
      totalDebited: 0,
      status: "ACTIVE",
      save: jest.fn(),
    });
  });

  it("computes systemFloatCOD as SUM(paymentBreakdown.codPendingAmount) for COD orders", async () => {
    // getAdminFinanceSummary runs 6 aggregates:
    // 1) onlineCollection, 2) codReconciled, 3) adminEarning, 4) pendingPayouts, 5) systemFloatCOD, 6) platformGross
    mockOrderAggregate
      .mockResolvedValueOnce([{ _id: null, amount: 270 }]) // onlineCollection
      .mockResolvedValueOnce([{ _id: null, amount: 60 }]) // codReconciled
      .mockResolvedValueOnce([{ _id: null, amount: 50 }]) // adminEarning (ONLINE only)
      .mockResolvedValueOnce([{ _id: null, amount: 375.55 }]) // systemFloatCOD = SUM(codPendingAmount)
      .mockResolvedValueOnce([{ _id: null, amount: 9999 }]); // platformGross = SUM(grandTotal/pricing.total)

    mockPayoutAggregate.mockResolvedValueOnce([
      { _id: "SELLER", amount: 180 },
      { _id: "DELIVERY_PARTNER", amount: 40 },
    ]);

    const summary = await getAdminFinanceSummary();

    expect(summary.systemFloatCOD).toBe(375.55);
    expect(summary.totalPlatformEarning).toBe(9999);
    expect(summary.availableBalance).toBe(9779);
    expect(summary.walletAvailableBalance).toBe(999);
    expect(mockOrderAggregate).toHaveBeenCalledTimes(5);
    expect(mockPayoutAggregate).toHaveBeenCalledTimes(1);
  });

  it("builds systemFloatCOD pipeline using pending when collected and estimate when not collected", async () => {
    mockOrderAggregate
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }])
      .mockResolvedValueOnce([{ _id: null, amount: 0 }]);
    mockPayoutAggregate.mockResolvedValueOnce([]);

    await getAdminFinanceSummary();

    const pipeline = mockOrderAggregate.mock.calls[3]?.[0];
    expect(Array.isArray(pipeline)).toBe(true);
    expect(JSON.stringify(pipeline)).toContain("codPendingAmount");
    expect(JSON.stringify(pipeline)).toContain("riderPayoutTotal");
    expect(JSON.stringify(pipeline)).toContain("codMarkedCollected");
  });
});
