import mongoose from "mongoose";
import LedgerEntry from "../../models/ledgerEntry.js";
import {
  LEDGER_DIRECTION,
  LEDGER_STATUS,
} from "../../constants/finance.js";
import { roundCurrency } from "../../utils/money.js";

function buildTransactionId(prefix = "LEDGER") {
  const now = Date.now();
  const rand = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, "0");
  return `${prefix}-${now}-${rand}`;
}

export async function createLedgerEntry(
  {
    transactionId,
    orderId = null,
    payoutId = null,
    walletId = null,
    actorType,
    actorId = null,
    type,
    direction = LEDGER_DIRECTION.CREDIT,
    amount,
    status = LEDGER_STATUS.COMPLETED,
    paymentMode = null,
    metadata = {},
    description = "",
    reference = "",
    balanceBefore = null,
    balanceAfter = null,
  },
  { session } = {},
) {
  const normalizedAmount = roundCurrency(amount || 0);
  if (normalizedAmount < 0) {
    throw new Error("Ledger amount cannot be negative");
  }

  const payload = {
    transactionId: transactionId || buildTransactionId(type || "LEDGER"),
    orderId:
      orderId && mongoose.Types.ObjectId.isValid(orderId)
        ? new mongoose.Types.ObjectId(orderId)
        : orderId,
    payoutId:
      payoutId && mongoose.Types.ObjectId.isValid(payoutId)
        ? new mongoose.Types.ObjectId(payoutId)
        : payoutId,
    walletId:
      walletId && mongoose.Types.ObjectId.isValid(walletId)
        ? new mongoose.Types.ObjectId(walletId)
        : walletId,
    actorType,
    actorId:
      actorId && mongoose.Types.ObjectId.isValid(actorId)
        ? new mongoose.Types.ObjectId(actorId)
        : actorId,
    type,
    direction,
    amount: normalizedAmount,
    status,
    paymentMode,
    metadata,
    description,
    reference,
    balanceBefore: balanceBefore == null ? null : roundCurrency(balanceBefore),
    balanceAfter: balanceAfter == null ? null : roundCurrency(balanceAfter),
  };

  const entry = new LedgerEntry(payload);
  await entry.save(session ? { session } : {});
  return entry;
}

export async function getLedgerEntries({
  page = 1,
  limit = 25,
  type,
  actorType,
  actorId,
  orderId,
  payoutId,
  paymentMode,
  fromDate,
  toDate,
} = {}) {
  const safePage = Math.max(parseInt(page, 10) || 1, 1);
  const safeLimit = Math.min(Math.max(parseInt(limit, 10) || 25, 1), 200);
  const skip = (safePage - 1) * safeLimit;

  const query = {};
  if (type) query.type = type;
  if (actorType) query.actorType = actorType;
  if (actorId) query.actorId = actorId;
  if (orderId) query.orderId = orderId;
  if (payoutId) query.payoutId = payoutId;
  if (paymentMode) query.paymentMode = paymentMode;
  if (fromDate || toDate) {
    query.createdAt = {};
    if (fromDate) query.createdAt.$gte = new Date(fromDate);
    if (toDate) {
      const end = new Date(toDate);
      end.setHours(23, 59, 59, 999);
      query.createdAt.$lte = end;
    }
  }

  const [items, total] = await Promise.all([
    LedgerEntry.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(safeLimit)
      .lean(),
    LedgerEntry.countDocuments(query),
  ]);

  return {
    items,
    page: safePage,
    limit: safeLimit,
    total,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}
