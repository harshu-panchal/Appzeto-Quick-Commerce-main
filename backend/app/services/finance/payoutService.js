import mongoose from "mongoose";
import Order from "../../models/order.js";
import Wallet from "../../models/wallet.js";
import Payout from "../../models/payout.js";
import Transaction from "../../models/transaction.js";
import FinanceAuditLog from "../../models/financeAuditLog.js";
import {
  PAYOUT_STATUS,
  PAYOUT_TYPE,
  OWNER_TYPE,
  LEDGER_TRANSACTION_TYPE,
  LEDGER_DIRECTION,
} from "../../constants/finance.js";
import { getOrCreateWallet } from "./walletService.js";
import { createLedgerEntry } from "./ledgerService.js";

const roundCurrency = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

function payoutTypeToOwnerType(payoutType) {
  if (payoutType === PAYOUT_TYPE.SELLER) return OWNER_TYPE.SELLER;
  if (payoutType === PAYOUT_TYPE.DELIVERY_PARTNER) return OWNER_TYPE.RIDER;
  throw new Error(`Unsupported payout type: ${payoutType}`);
}

async function createFinanceAuditLog(data, { session } = {}) {
  return await FinanceAuditLog.create([data], { session });
}

export async function createPendingPayoutForOrder({
  order,
  payoutType,
  beneficiaryId,
  amount,
  remarks = "Automatic payout creation on delivery.",
  metadata = {},
}) {
  if (!order || !beneficiaryId || amount <= 0) return null;

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const existing = await Payout.findOne({
      relatedOrderIds: order._id,
      payoutType,
      status: { $ne: PAYOUT_STATUS.CANCELLED },
    }).session(session);

    if (existing) {
      await session.abortTransaction();
      return existing;
    }

    const ownerType = payoutTypeToOwnerType(payoutType);
    const wallet = await getOrCreateWallet(ownerType, beneficiaryId, { session });

    const payout = await Payout.create(
      [
        {
          payoutType,
          beneficiaryId,
          amount: roundCurrency(amount),
          status: PAYOUT_STATUS.PENDING,
          relatedOrderIds: [order._id],
          remarks,
          metadata: {
            ...metadata,
            orderId: order.orderId,
          },
        },
      ],
      { session },
    );

    wallet.pendingBalance = roundCurrency((wallet.pendingBalance || 0) + amount);
    wallet.totalCredited = roundCurrency((wallet.totalCredited || 0) + amount);
    await wallet.save({ session });

    await createLedgerEntry(
      {
        orderId: order._id,
        payoutId: payout[0]._id,
        walletId: wallet._id,
        actorType: ownerType,
        actorId: beneficiaryId,
        type: LEDGER_TRANSACTION_TYPE.PAYOUT_QUEUED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: roundCurrency(amount),
        description: `${payoutType} payout queued for order ${order.orderId}`,
      },
      { session },
    );

    await session.commitTransaction();
    return payout[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function processPayout(payoutId, { remarks = "", adminId = null } = {}) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const payout = await Payout.findById(payoutId).session(session);
    if (!payout) throw new Error("Payout not found.");
    if (payout.status !== PAYOUT_STATUS.PENDING && payout.status !== PAYOUT_STATUS.PROCESSING) {
      throw new Error(`Invalid payout status for processing: ${payout.status}`);
    }

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const wallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    const amount = roundCurrency(payout.amount);
    if (wallet.pendingBalance < amount) {
      console.warn(`[Payout] Warning: Pending balance (${wallet.pendingBalance}) less than payout (${amount}) for ${ownerType} ${payout.beneficiaryId}`);
    }

    wallet.pendingBalance = roundCurrency(Math.max(0, (wallet.pendingBalance || 0) - amount));
    wallet.availableBalance = roundCurrency((wallet.availableBalance || 0) + amount);
    await wallet.save({ session });

    payout.status = PAYOUT_STATUS.COMPLETED;
    payout.processedAt = new Date();
    payout.remarks = remarks || payout.remarks;
    if (adminId) payout.createdBy = adminId;
    await payout.save({ session });

    for (const orderId of payout.relatedOrderIds) {
      const order = await Order.findById(orderId).session(session);
      if (!order) continue;

      if (payout.payoutType === PAYOUT_TYPE.SELLER) {
        order.settlementStatus = { ...(order.settlementStatus || {}), sellerPayout: "COMPLETED" };
        order.financeFlags = { ...(order.financeFlags || {}), sellerPayoutQueued: true };
      } else if (payout.payoutType === PAYOUT_TYPE.DELIVERY_PARTNER) {
        order.settlementStatus = { ...(order.settlementStatus || {}), riderPayout: "COMPLETED" };
        order.financeFlags = { ...(order.financeFlags || {}), riderPayoutQueued: true };
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

export async function cancelPendingPayoutForOrder(orderId, payoutType, { remarks, adminId, session: externalSession } = {}) {
  const session = externalSession || (await mongoose.startSession());
  const managedSession = !externalSession;
  if (managedSession) session.startTransaction();

  try {
    const payout = await Payout.findOne({
      relatedOrderIds: orderId,
      payoutType,
      status: { $in: [PAYOUT_STATUS.PENDING, PAYOUT_STATUS.PROCESSING] },
    }, null, { session });

    if (!payout) return null;

    const ownerType = payoutTypeToOwnerType(payout.payoutType);
    const beneficiaryWallet = await getOrCreateWallet(ownerType, payout.beneficiaryId, { session });

    const amount = roundCurrency(payout.amount);
    beneficiaryWallet.pendingBalance = roundCurrency(Math.max((beneficiaryWallet.pendingBalance || 0) - amount, 0));
    beneficiaryWallet.totalCredited = roundCurrency(Math.max((beneficiaryWallet.totalCredited || 0) - amount, 0));
    await beneficiaryWallet.save({ session });

    payout.status = PAYOUT_STATUS.CANCELLED;
    payout.remarks = remarks || `Payout cancelled due to return/reversal.`;
    payout.cancelledAt = new Date();
    if (adminId) payout.createdBy = adminId;
    await payout.save({ session });

    await createLedgerEntry(
      {
        orderId,
        payoutId: payout._id,
        walletId: beneficiaryWallet._id,
        actorType: ownerType,
        actorId: payout.beneficiaryId,
        type: LEDGER_TRANSACTION_TYPE.PAYOUT_CANCELLED || "PAYOUT_CANCELLED",
        direction: LEDGER_DIRECTION.DEBIT,
        amount,
        description: `Pending ${payout.payoutType} payout reversed due to return.`,
      },
      { session },
    );

    if (managedSession) await session.commitTransaction();
    return payout;
  } catch (error) {
    if (managedSession) await session.abortTransaction();
    throw error;
  } finally {
    if (managedSession) session.endSession();
  }
}

export const bulkProcessPayouts = async ({
  payoutIds = [],
  payoutType,
  limit = 50,
  adminId = null,
  remarks = "",
} = {}) => {
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
