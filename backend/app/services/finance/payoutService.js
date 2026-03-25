import mongoose from "mongoose";
import Payout from "../../models/payout.js";
import Order from "../../models/order.js";
import {
  LEDGER_DIRECTION,
  LEDGER_TRANSACTION_TYPE,
  OWNER_TYPE,
  PAYOUT_STATUS,
  PAYOUT_TYPE,
} from "../../constants/finance.js";
import {
  debitWallet,
  getOrCreateWallet,
  movePendingToAvailable,
} from "./walletService.js";
import { createLedgerEntry } from "./ledgerService.js";
import { createFinanceAuditLog } from "./auditLogService.js";
import { roundCurrency } from "../../utils/money.js";

function payoutTypeToOwnerType(payoutType) {
  if (payoutType === PAYOUT_TYPE.SELLER) return OWNER_TYPE.SELLER;
  return OWNER_TYPE.DELIVERY_PARTNER;
}

function pendingLedgerTypeByPayoutType(payoutType) {
  return payoutType === PAYOUT_TYPE.SELLER
    ? LEDGER_TRANSACTION_TYPE.SELLER_PAYOUT_PENDING
    : LEDGER_TRANSACTION_TYPE.RIDER_PAYOUT_PENDING;
}

function processedLedgerTypeByPayoutType(payoutType) {
  return payoutType === PAYOUT_TYPE.SELLER
    ? LEDGER_TRANSACTION_TYPE.SELLER_PAYOUT_PROCESSED
    : LEDGER_TRANSACTION_TYPE.RIDER_PAYOUT_PROCESSED;
}

export async function createPendingPayoutForOrder(
  {
    order,
    payoutType,
    beneficiaryId,
    amount,
    remarks = "",
    createdBy = null,
    metadata = {},
  },
  { session } = {},
) {
  const normalizedAmount = roundCurrency(amount || 0);
  if (!order?._id || normalizedAmount <= 0 || !beneficiaryId) {
    return null;
  }

  const existing = await Payout.findOne(
    {
      payoutType,
      beneficiaryId,
      relatedOrderIds: order._id,
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING, PAYOUT_STATUS.COMPLETED] },
    },
    null,
    session ? { session } : {},
  );
  if (existing) return existing;

  const ownerType = payoutTypeToOwnerType(payoutType);
  const beneficiaryWallet = await getOrCreateWallet(ownerType, beneficiaryId, { session });

  beneficiaryWallet.pendingBalance = roundCurrency(
    (beneficiaryWallet.pendingBalance || 0) + normalizedAmount,
  );
  beneficiaryWallet.totalCredited = roundCurrency(
    (beneficiaryWallet.totalCredited || 0) + normalizedAmount,
  );
  await beneficiaryWallet.save({ session });

  const payout = await Payout.create(
    [
      {
        payoutType,
        beneficiaryId,
        amount: normalizedAmount,
        status: PAYOUT_STATUS.PENDING,
        relatedOrderIds: [order._id],
        walletId: beneficiaryWallet._id,
        remarks,
        createdBy,
        metadata,
      },
    ],
    session ? { session } : {},
  );

  await createLedgerEntry(
    {
      orderId: order._id,
      payoutId: payout[0]._id,
      walletId: beneficiaryWallet._id,
      actorType: ownerType,
      actorId: beneficiaryId,
      type: pendingLedgerTypeByPayoutType(payoutType),
      direction: LEDGER_DIRECTION.CREDIT,
      amount: normalizedAmount,
      paymentMode: order.paymentMode,
      description: `${payoutType} payout moved to pending`,
      reference: order.orderId,
    },
    { session },
  );

  await createFinanceAuditLog(
    {
      action: "PAYOUT_QUEUED",
      actorType: OWNER_TYPE.ADMIN,
      actorId: createdBy,
      orderId: order._id,
      payoutId: payout[0]._id,
      metadata: { payoutType, amount: normalizedAmount, beneficiaryId },
    },
    { session },
  );

  return payout[0];
}

function patchOrderSettlementForPayout(order, payoutType, status) {
  const next = { ...(order.settlementStatus || {}) };
  if (payoutType === PAYOUT_TYPE.SELLER) {
    next.sellerPayout = status;
  } else {
    next.riderPayout = status;
  }

  const sellerDone = next.sellerPayout === "COMPLETED";
  const riderDone =
    next.riderPayout === "COMPLETED" || next.riderPayout === "NOT_APPLICABLE";
  if (sellerDone && riderDone && next.adminEarningCredited) {
    next.overall = "COMPLETED";
    if (!next.reconciledAt) next.reconciledAt = new Date();
  } else if (sellerDone || riderDone || next.adminEarningCredited) {
    next.overall = "PARTIAL";
  }
  return next;
}

export async function processPayout(payoutId, { remarks, adminId } = {}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const payout = await Payout.findById(payoutId, null, { session });
    if (!payout) {
      throw new Error("Payout not found");
    }
    if (![PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING].includes(payout.status)) {
      throw new Error("Payout is not processable");
    }

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const adminWallet = await getOrCreateWallet(OWNER_TYPE.ADMIN, null, { session });
    const beneficiaryWallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    const debitResult = await debitWallet({
      ownerType: OWNER_TYPE.ADMIN,
      ownerId: null,
      amount: payout.amount,
      bucket: "available",
      session,
    });

    const moveResult = await movePendingToAvailable({
      ownerType,
      ownerId: payout.beneficiaryId,
      amount: payout.amount,
      session,
    });

    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.processedAt = new Date();
    if (remarks) payout.remarks = remarks;
    payout.createdBy = adminId || payout.createdBy;
    payout.failedReason = undefined;
    await payout.save({ session });

    await createLedgerEntry(
      {
        payoutId: payout._id,
        walletId: adminWallet._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: processedLedgerTypeByPayoutType(payout.payoutType),
        direction: LEDGER_DIRECTION.DEBIT,
        amount: payout.amount,
        status: "COMPLETED",
        description: `${payout.payoutType} payout processed`,
        reference: `PAYOUT-${payout._id}`,
        balanceBefore: debitResult.before,
        balanceAfter: debitResult.after,
      },
      { session },
    );

    await createLedgerEntry(
      {
        payoutId: payout._id,
        walletId: beneficiaryWallet._id,
        actorType: ownerType,
        actorId: payout.beneficiaryId,
        type: processedLedgerTypeByPayoutType(payout.payoutType),
        direction: LEDGER_DIRECTION.CREDIT,
        amount: payout.amount,
        status: "COMPLETED",
        description: `${payout.payoutType} payout released to beneficiary`,
        reference: `PAYOUT-${payout._id}`,
        balanceBefore: moveResult.availableBefore,
        balanceAfter: moveResult.availableAfter,
      },
      { session },
    );

    const relatedOrders = await Order.find(
      { _id: { $in: payout.relatedOrderIds || [] } },
      null,
      { session },
    );
    for (const order of relatedOrders) {
      order.settlementStatus = patchOrderSettlementForPayout(
        order,
        payout.payoutType,
        "COMPLETED",
      );
      if (payout.payoutType === PAYOUT_TYPE.SELLER) {
        order.financeFlags = {
          ...(order.financeFlags || {}),
          sellerPayoutQueued: true,
        };
      } else {
        order.financeFlags = {
          ...(order.financeFlags || {}),
          riderPayoutQueued: true,
        };
      }
      await order.save({ session });
    }

    await createFinanceAuditLog(
      {
        action: "PAYOUT_PROCESSED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: adminId || null,
        payoutId: payout._id,
        metadata: {
          payoutType: payout.payoutType,
          beneficiaryId: String(payout.beneficiaryId),
          amount: payout.amount,
        },
      },
      { session },
    );

    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function bulkProcessPayouts({
  payoutIds = [],
  payoutType,
  limit = 50,
  adminId = null,
  remarks = "",
} = {}) {
  let targets = payoutIds;
  if (!Array.isArray(targets) || targets.length === 0) {
    const query = {
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
    };
    if (payoutType) query.payoutType = payoutType;
    const list = await Payout.find(query)
      .sort({ createdAt: 1 })
      .limit(Math.max(Math.min(Number(limit) || 50, 200), 1))
      .select("_id")
      .lean();
    targets = list.map((row) => String(row._id));
  }

  const results = [];
  for (const id of targets) {
    try {
      const payout = await processPayout(id, { remarks, adminId });
      results.push({
        payoutId: String(payout._id),
        status: "COMPLETED",
      });
    } catch (error) {
      results.push({
        payoutId: String(id),
        status: "FAILED",
        reason: error.message,
      });
    }
  }

  return {
    total: results.length,
    completed: results.filter((row) => row.status === "COMPLETED").length,
    failed: results.filter((row) => row.status === "FAILED").length,
    results,
  };
}

export async function queueSellerPayouts({ orderIds = [] } = {}) {
  const query = {
    status: "delivered",
    "settlementStatus.sellerPayout": { $ne: "COMPLETED" },
  };
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    query._id = { $in: orderIds };
  }

  const orders = await Order.find(query).lean();
  const created = [];

  for (const order of orders) {
    const payout = await createPendingPayoutForOrder({
      order,
      payoutType: PAYOUT_TYPE.SELLER,
      beneficiaryId: order.seller,
      amount: order.paymentBreakdown?.sellerPayoutTotal || 0,
      metadata: { trigger: "queueSellerPayouts" },
    });
    if (payout) created.push(payout);
  }

  return created;
}

export async function queueRiderPayouts({ orderIds = [] } = {}) {
  const query = {
    status: "delivered",
    "settlementStatus.riderPayout": { $ne: "COMPLETED" },
    deliveryBoy: { $ne: null },
  };
  if (Array.isArray(orderIds) && orderIds.length > 0) {
    query._id = { $in: orderIds };
  }

  const orders = await Order.find(query).lean();
  const created = [];

  for (const order of orders) {
    const payout = await createPendingPayoutForOrder({
      order,
      payoutType: PAYOUT_TYPE.DELIVERY_PARTNER,
      beneficiaryId: order.deliveryBoy,
      amount: order.paymentBreakdown?.riderPayoutTotal || 0,
      metadata: { trigger: "queueRiderPayouts" },
    });
    if (payout) created.push(payout);
  }

  return created;
}
