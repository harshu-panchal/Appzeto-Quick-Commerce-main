import { jest } from "@jest/globals";

const mockStartSession = jest.fn();
const mockOrderFindOne = jest.fn();

const mockCreateLedgerEntry = jest.fn();
const mockCreateFinanceAuditLog = jest.fn();
const mockCreditWallet = jest.fn();
const mockDebitWallet = jest.fn();
const mockGetOrCreateWallet = jest.fn();
const mockUpdateCashInHand = jest.fn();
const mockCreatePendingPayoutForOrder = jest.fn();

function createSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn(),
    abortTransaction: jest.fn(),
    endSession: jest.fn(),
  };
}

function makeOrder(overrides = {}) {
  return {
    _id: "order-1",
    orderId: "ORD10001",
    paymentMode: "COD",
    paymentStatus: "PENDING_CASH_COLLECTION",
    status: "pending",
    orderStatus: "pending",
    seller: "seller-1",
    deliveryBoy: "rider-1",
    payment: { method: "cash", status: "pending" },
    paymentBreakdown: {
      grandTotal: 300,
      sellerPayoutTotal: 220,
      riderPayoutTotal: 50,
      platformTotalEarning: 30,
      codCollectedAmount: 0,
      codRemittedAmount: 0,
      codPendingAmount: 0,
    },
    financeFlags: {},
    settlementStatus: {
      overall: "PENDING",
      sellerPayout: "PENDING",
      riderPayout: "PENDING",
      adminEarningCredited: false,
      reconciledAt: null,
    },
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

jest.unstable_mockModule("mongoose", () => ({
  default: {
    startSession: mockStartSession,
    Types: {
      ObjectId: class MockObjectId {
        constructor(value) {
          this.value = value;
        }
        toString() {
          return String(this.value);
        }
        static isValid(value) {
          return typeof value === "string" && value.length > 0;
        }
      },
    },
  },
}));

jest.unstable_mockModule("../app/models/order.js", () => ({
  default: {
    findOne: mockOrderFindOne,
  },
}));

jest.unstable_mockModule("../app/services/finance/ledgerService.js", () => ({
  createLedgerEntry: mockCreateLedgerEntry,
}));

jest.unstable_mockModule("../app/services/finance/auditLogService.js", () => ({
  createFinanceAuditLog: mockCreateFinanceAuditLog,
}));

jest.unstable_mockModule("../app/services/finance/walletService.js", () => ({
  creditWallet: mockCreditWallet,
  debitWallet: mockDebitWallet,
  getOrCreateWallet: mockGetOrCreateWallet,
  updateCashInHand: mockUpdateCashInHand,
}));

jest.unstable_mockModule("../app/services/finance/payoutService.js", () => ({
  createPendingPayoutForOrder: mockCreatePendingPayoutForOrder,
}));

const {
  handleOnlineOrderFinance,
  handleCodOrderFinance,
  settleDeliveredOrder,
  reconcileCodCash,
  reverseOrderFinanceOnCancellation,
} = await import("../app/services/finance/orderFinanceService.js");

const {
  ORDER_PAYMENT_STATUS,
  PAYOUT_TYPE,
  LEDGER_TRANSACTION_TYPE,
} = await import("../app/constants/finance.js");

describe("finance order flow", () => {
  let currentSession;
  let currentOrder;

  beforeEach(() => {
    jest.clearAllMocks();
    currentSession = createSession();
    currentOrder = makeOrder();

    mockStartSession.mockResolvedValue(currentSession);
    mockOrderFindOne.mockImplementation(async () => currentOrder);
    mockGetOrCreateWallet.mockResolvedValue({ _id: "admin-wallet-1" });
    mockCreditWallet.mockResolvedValue({
      wallet: { _id: "admin-wallet-1" },
      before: 1000,
      after: 1300,
      amount: 300,
    });
    mockDebitWallet.mockResolvedValue({
      wallet: { _id: "admin-wallet-1" },
      before: 1300,
      after: 1000,
      amount: 300,
    });
    mockUpdateCashInHand.mockResolvedValue({
      before: 0,
      after: 300,
      delta: 300,
      wallet: { _id: "rider-wallet-1" },
    });
    mockCreatePendingPayoutForOrder.mockImplementation(async ({ payoutType }) => ({
      _id: payoutType === PAYOUT_TYPE.SELLER ? "p-seller-1" : "p-rider-1",
      payoutType,
    }));
  });

  it("captures online payment and creates ledger entry", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.paymentBreakdown.grandTotal = 450;

    const updated = await handleOnlineOrderFinance({ _id: "order-1" }, {
      actorId: "admin-1",
      transactionId: "pay_123",
    });

    expect(updated.paymentStatus).toBe(ORDER_PAYMENT_STATUS.PAID);
    expect(updated.financeFlags.onlinePaymentCaptured).toBe(true);
    expect(updated.payment.transactionId).toBe("pay_123");
    expect(mockCreditWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 450,
        ownerType: "ADMIN",
        bucket: "available",
      }),
    );
    expect(mockCreateLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LEDGER_TRANSACTION_TYPE.ORDER_ONLINE_PAYMENT_CAPTURED,
        amount: 450,
      }),
      expect.any(Object),
    );
    expect(currentSession.commitTransaction).toHaveBeenCalled();
  });

  it("keeps online capture idempotent when already captured", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.financeFlags = { onlinePaymentCaptured: true };

    await handleOnlineOrderFinance({ _id: "order-1" }, { transactionId: "pay_x" });

    expect(mockCreditWallet).not.toHaveBeenCalled();
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
    expect(currentSession.commitTransaction).toHaveBeenCalled();
  });

  it("blocks COD collection for ONLINE orders", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.status = "delivered";
    currentOrder.orderStatus = "delivered";

    await expect(
      handleCodOrderFinance({ _id: "order-1" }, { deliveryPartnerId: "rider-1" }),
    ).rejects.toThrow("COD collection is not allowed for ONLINE orders");

    expect(currentSession.abortTransaction).toHaveBeenCalled();
  });

  it("blocks COD collection before delivery", async () => {
    currentOrder.paymentMode = "COD";
    currentOrder.status = "pending";
    currentOrder.orderStatus = "pending";

    await expect(
      handleCodOrderFinance({ _id: "order-1" }, { deliveryPartnerId: "rider-1" }),
    ).rejects.toThrow("COD can only be collected after order delivery");
  });

  it("marks COD cash collection, updates rider cash and order snapshot", async () => {
    currentOrder.paymentMode = "COD";
    currentOrder.status = "delivered";
    currentOrder.orderStatus = "delivered";

    const updated = await handleCodOrderFinance(
      { _id: "order-1" },
      { deliveryPartnerId: "rider-1" },
    );

    expect(updated.paymentStatus).toBe(ORDER_PAYMENT_STATUS.CASH_COLLECTED);
    expect(updated.financeFlags.codMarkedCollected).toBe(true);
    // Net of rider commission (grandTotal 300 - riderPayoutTotal 50)
    expect(updated.paymentBreakdown.codCollectedAmount).toBe(250);
    expect(updated.paymentBreakdown.codPendingAmount).toBe(250);
    expect(mockUpdateCashInHand).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: "DELIVERY_PARTNER",
        deltaAmount: 250,
      }),
    );
  });

  it("keeps COD collection idempotent if already marked", async () => {
    currentOrder.paymentMode = "COD";
    currentOrder.status = "delivered";
    currentOrder.orderStatus = "delivered";
    currentOrder.financeFlags = { codMarkedCollected: true };

    await handleCodOrderFinance({ _id: "order-1" }, { deliveryPartnerId: "rider-1" });

    expect(mockUpdateCashInHand).not.toHaveBeenCalled();
    expect(mockCreateLedgerEntry).not.toHaveBeenCalled();
    expect(currentSession.commitTransaction).toHaveBeenCalled();
  });

  it("settles delivered orders by queueing payouts and admin earning", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.financeFlags = { onlinePaymentCaptured: true };
    currentOrder.status = "pending";
    currentOrder.orderStatus = "pending";

    const updated = await settleDeliveredOrder({ _id: "order-1" }, { actorId: "admin-1" });

    expect(updated.status).toBe("delivered");
    expect(updated.orderStatus).toBe("delivered");
    expect(updated.financeFlags.deliveredSettlementApplied).toBe(true);
    expect(updated.settlementStatus.adminEarningCredited).toBe(true);
    expect(mockCreatePendingPayoutForOrder).toHaveBeenCalledTimes(2);
  });

  it("backfills paymentBreakdown snapshots when missing", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.financeFlags = { onlinePaymentCaptured: true };
    currentOrder.status = "pending";
    currentOrder.orderStatus = "pending";
    // Simulate legacy/partial docs (no snapshots present)
    delete currentOrder.paymentBreakdown.snapshots;

    await settleDeliveredOrder({ _id: "order-1" }, { actorId: "admin-1" });

    expect(currentOrder.paymentBreakdown.snapshots).toEqual(
      expect.objectContaining({
        deliverySettings: expect.any(Object),
        categoryCommissionSettings: expect.any(Array),
        handlingCategoryUsed: expect.any(Object),
      }),
    );
  });

  it("blocks online delivered settlement before payment capture", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.financeFlags = {};

    await expect(
      settleDeliveredOrder({ _id: "order-1" }, { actorId: "admin-1" }),
    ).rejects.toThrow("Cannot settle delivered online order before payment capture");
  });

  it("reconciles COD cash and marks status as fully reconciled", async () => {
    currentOrder.paymentMode = "COD";
    currentOrder.deliveryBoy = "rider-1";
    currentOrder.paymentBreakdown.codCollectedAmount = 300;
    currentOrder.paymentBreakdown.codRemittedAmount = 100;
    currentOrder.paymentBreakdown.codPendingAmount = 200;

    const updated = await reconcileCodCash(
      { _id: "order-1" },
      200,
      "rider-1",
      { actorId: "admin-1" },
    );

    expect(updated.paymentBreakdown.codRemittedAmount).toBe(300);
    expect(updated.paymentBreakdown.codPendingAmount).toBe(0);
    expect(updated.paymentStatus).toBe(ORDER_PAYMENT_STATUS.COD_RECONCILED);
    expect(updated.settlementStatus.reconciledAt).toBeInstanceOf(Date);
    expect(mockCreateLedgerEntry).toHaveBeenCalledTimes(2);
  });

  it("blocks COD remittance greater than pending amount", async () => {
    currentOrder.paymentMode = "COD";
    currentOrder.deliveryBoy = "rider-1";
    currentOrder.paymentBreakdown.codCollectedAmount = 300;
    currentOrder.paymentBreakdown.codRemittedAmount = 290;

    await expect(
      reconcileCodCash({ _id: "order-1" }, 20, "rider-1", { actorId: "admin-1" }),
    ).rejects.toThrow("Reconciliation amount exceeds COD pending amount");
  });

  it("creates refund ledger movement on online cancellation reversal", async () => {
    currentOrder.paymentMode = "ONLINE";
    currentOrder.financeFlags = { onlinePaymentCaptured: true };
    currentOrder.paymentBreakdown.grandTotal = 180;

    const updated = await reverseOrderFinanceOnCancellation(
      { _id: "order-1" },
      { actorId: "admin-1", reason: "Cancelled before acceptance" },
    );

    expect(updated.paymentStatus).toBe(ORDER_PAYMENT_STATUS.REFUNDED);
    expect(updated.settlementStatus.overall).toBe("CANCELLED");
    expect(mockDebitWallet).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerType: "ADMIN",
        amount: 180,
      }),
    );
    expect(mockCreateLedgerEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        type: LEDGER_TRANSACTION_TYPE.REFUND,
        amount: 180,
      }),
      expect.any(Object),
    );
  });
});
