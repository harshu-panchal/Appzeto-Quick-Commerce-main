import mongoose from "mongoose";
import Order from "../../models/order.js";
import {
  LEDGER_DIRECTION,
  LEDGER_TRANSACTION_TYPE,
  ORDER_PAYMENT_STATUS,
  ORDER_SETTLEMENT_STATUS,
  OWNER_TYPE,
  PAYOUT_TYPE,
} from "../../constants/finance.js";
import { addMoney, roundCurrency } from "../../utils/money.js";
import { createLedgerEntry } from "./ledgerService.js";
import { createFinanceAuditLog } from "./auditLogService.js";
import {
  creditWallet,
  debitWallet,
  getOrCreateWallet,
  updateCashInHand,
} from "./walletService.js";
import { createPendingPayoutForOrder } from "./payoutService.js";

function toOrderIdQuery(orderOrId) {
  if (!orderOrId) return null;
  if (typeof orderOrId === "object" && orderOrId._id) {
    return { _id: orderOrId._id };
  }
  if (mongoose.Types.ObjectId.isValid(orderOrId)) {
    return { _id: new mongoose.Types.ObjectId(orderOrId) };
  }
  return { orderId: String(orderOrId) };
}

async function findOrderForUpdate(orderOrId, session) {
  const query = toOrderIdQuery(orderOrId);
  if (!query) {
    throw new Error("Order not found");
  }
  const order = await Order.findOne(query, null, { session });
  if (!order) {
    throw new Error("Order not found");
  }
  // Backward-compat: older / partially-upgraded orders may have paymentBreakdown without snapshots.
  // Mongoose will throw a cast error on save if `paymentBreakdown.snapshots` is undefined.
  if (order.paymentBreakdown) {
    const snapshots = order.paymentBreakdown.snapshots;
    if (!snapshots || typeof snapshots !== "object") {
      order.paymentBreakdown.snapshots = {
        deliverySettings: {},
        categoryCommissionSettings: [],
        handlingFeeStrategy: null,
        handlingCategoryUsed: {},
      };
    }
  }
  return order;
}

function computeOverallSettlement(order) {
  const settlement = order.settlementStatus || {};
  const sellerDone = settlement.sellerPayout === "COMPLETED";
  const riderDone =
    settlement.riderPayout === "COMPLETED" ||
    settlement.riderPayout === "NOT_APPLICABLE";
  const adminDone = Boolean(settlement.adminEarningCredited);

  if (sellerDone && riderDone && adminDone) {
    settlement.overall = ORDER_SETTLEMENT_STATUS.COMPLETED;
    if (!settlement.reconciledAt) settlement.reconciledAt = new Date();
  } else if (sellerDone || riderDone || adminDone) {
    settlement.overall = ORDER_SETTLEMENT_STATUS.PARTIAL;
  } else {
    settlement.overall = ORDER_SETTLEMENT_STATUS.PENDING;
  }
  return settlement;
}

function syncLegacyPricing(order) {
  const breakdown = order.paymentBreakdown || {};
  order.pricing = {
    subtotal: breakdown.productSubtotal || order.pricing?.subtotal || 0,
    deliveryFee: breakdown.deliveryFeeCharged || order.pricing?.deliveryFee || 0,
    platformFee: breakdown.handlingFeeCharged || order.pricing?.platformFee || 0,
    gst: breakdown.taxTotal || order.pricing?.gst || 0,
    tip: breakdown.tipTotal || order.pricing?.tip || 0,
    discount: breakdown.discountTotal || order.pricing?.discount || 0,
    total: breakdown.grandTotal || order.pricing?.total || 0,
    walletAmount: breakdown.walletAmount || order.pricing?.walletAmount || 0,
  };
}

function ensurePaymentBreakdownSnapshots(order) {
  if (!order?.paymentBreakdown) return;
  const snapshots = order.paymentBreakdown.snapshots;
  if (snapshots && typeof snapshots === "object") return;
  order.paymentBreakdown.snapshots = {
    deliverySettings: {},
    categoryCommissionSettings: [],
    handlingFeeStrategy: null,
    handlingCategoryUsed: {},
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  return fallback;
}

function getReturnEligibilityDelayMinutes() {
  return parsePositiveInt(process.env.RETURN_ELIGIBILITY_DELAY_MINUTES, 2);
}

function getReturnWindowMinutes() {
  return parsePositiveInt(process.env.RETURN_WINDOW_MINUTES, 2);
}

function computeReturnWindowDates(deliveredAt) {
  const eligibleDelay = getReturnEligibilityDelayMinutes();
  const windowMinutes = getReturnWindowMinutes();
  const start = deliveredAt instanceof Date ? deliveredAt : new Date();
  const eligibleAt = new Date(start.getTime() + eligibleDelay * 60 * 1000);
  const windowExpiresAt = new Date(start.getTime() + windowMinutes * 60 * 1000);

  return {
    eligibleAt,
    windowExpiresAt,
  };
}

export function freezeFinancialSnapshot(order, breakdown) {
  if (!order || !breakdown) return order;

  const sanitized = { ...breakdown };
  if (!sanitized.snapshots || typeof sanitized.snapshots !== "object") {
    sanitized.snapshots = {
      deliverySettings: {},
      categoryCommissionSettings: [],
      handlingFeeStrategy: null,
      handlingCategoryUsed: {},
    };
  }

  order.paymentBreakdown = {
    ...sanitized,
    codCollectedAmount: roundCurrency(sanitized.codCollectedAmount || 0),
    codRemittedAmount: roundCurrency(sanitized.codRemittedAmount || 0),
    codPendingAmount: roundCurrency(sanitized.codPendingAmount || 0),
    walletAmount: roundCurrency(sanitized.walletAmount || order.pricing?.walletAmount || 0),
  };
  ensurePaymentBreakdownSnapshots(order);

  order.distanceSnapshot = {
    distanceKmActual: roundCurrency(sanitized.distanceKmActual || 0),
    distanceKmRounded: roundCurrency(sanitized.distanceKmRounded || 0),
    source: sanitized?.snapshots?.deliverySettings?.distanceSource || "haversine",
  };

  order.pricingSnapshot = {
    deliverySettings: sanitized?.snapshots?.deliverySettings || {},
    categoryCommissionSettings: sanitized?.snapshots?.categoryCommissionSettings || [],
    handlingFeeStrategy: sanitized?.snapshots?.handlingFeeStrategy || null,
    handlingCategoryUsed: sanitized?.snapshots?.handlingCategoryUsed || {},
  };

  syncLegacyPricing(order);
  return order;
}

export async function createPendingSellerPayout(order, { session, actorId } = {}) {
  if (!order?.seller) return null;
  if (order.financeFlags?.sellerPayoutQueued) return null;

  const amount = roundCurrency(order.paymentBreakdown?.sellerPayoutTotal || 0);
  if (amount <= 0) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      sellerPayout: "NOT_APPLICABLE",
    };
    return null;
  }

  const payout = await createPendingPayoutForOrder(
    {
      order,
      payoutType: PAYOUT_TYPE.SELLER,
      beneficiaryId: order.seller,
      amount,
      createdBy: actorId || null,
      metadata: { flow: "order_delivered" },
    },
    { session },
  );

  order.financeFlags = {
    ...(order.financeFlags || {}),
    sellerPayoutQueued: true,
  };
  order.settlementStatus = {
    ...(order.settlementStatus || {}),
    sellerPayout: "PENDING",
  };
  return payout;
}

export async function releaseHeldSellerPayout(orderOrId, { actorId = null } = {}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (!order?.seller) {
      await session.commitTransaction();
      return null;
    }

    if (order.financeFlags?.sellerPayoutQueued) {
      await session.commitTransaction();
      return null;
    }

    const payout = await createPendingSellerPayout(order, { session, actorId });
    order.financeFlags = {
      ...(order.financeFlags || {}),
      sellerPayoutHeld: false,
    };
    if (payout) {
      order.settlementStatus = {
        ...(order.settlementStatus || {}),
        sellerPayout: "PENDING",
      };
    }

    await order.save({ session });
    await session.commitTransaction();
    return payout;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function createPendingRiderPayout(order, { session, actorId } = {}) {
  if (!order?.deliveryBoy) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      riderPayout: "NOT_APPLICABLE",
    };
    return null;
  }
  if (order.financeFlags?.riderPayoutQueued) return null;

  const amount = roundCurrency(order.paymentBreakdown?.riderPayoutTotal || 0);
  if (amount <= 0) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      riderPayout: "NOT_APPLICABLE",
    };
    return null;
  }

  const payout = await createPendingPayoutForOrder(
    {
      order,
      payoutType: PAYOUT_TYPE.DELIVERY_PARTNER,
      beneficiaryId: order.deliveryBoy,
      amount,
      createdBy: actorId || null,
      metadata: { flow: "order_delivered" },
    },
    { session },
  );

  order.financeFlags = {
    ...(order.financeFlags || {}),
    riderPayoutQueued: true,
  };
  order.settlementStatus = {
    ...(order.settlementStatus || {}),
    riderPayout: "PENDING",
  };
  return payout;
}

export async function creditAdminEarning(order, { session, actorId } = {}) {
  if (order.financeFlags?.adminEarningCredited) return null;

  // Requirement: For COD orders, do not recognize/credit admin earning at delivery time.
  // COD inflows are tracked via remittance (system float) instead.
  if (order.paymentMode === "COD") {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      adminEarningCredited: true,
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      adminEarningCredited: true,
    };
    return null;
  }

  const adminEarning = roundCurrency(order.paymentBreakdown?.platformTotalEarning || 0);
  if (adminEarning <= 0) {
    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      adminEarningCredited: true,
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      adminEarningCredited: true,
    };
    return null;
  }

  const adminWallet = await getOrCreateWallet(OWNER_TYPE.ADMIN, null, { session });
  await createLedgerEntry(
    {
      orderId: order._id,
      walletId: adminWallet._id,
      actorType: OWNER_TYPE.ADMIN,
      actorId: null,
      type: LEDGER_TRANSACTION_TYPE.ADMIN_EARNING_CREDITED,
      direction: LEDGER_DIRECTION.CREDIT,
      amount: adminEarning,
      paymentMode: order.paymentMode,
      description: "Platform earning recognized on delivery",
      reference: order.orderId,
    },
    { session },
  );

  order.settlementStatus = {
    ...(order.settlementStatus || {}),
    adminEarningCredited: true,
  };
  order.financeFlags = {
    ...(order.financeFlags || {}),
    adminEarningCredited: true,
  };

  await createFinanceAuditLog(
    {
      action: "ORDER_DELIVERED_SETTLED",
      actorType: OWNER_TYPE.ADMIN,
      actorId: actorId || null,
      orderId: order._id,
      metadata: { adminEarning },
    },
    { session },
  );

  return adminEarning;
}

export async function handleOnlineOrderFinance(
  orderOrId,
  { actorId = null, transactionId = "", metadata = {} } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.paymentMode !== "ONLINE") {
      order.paymentMode = "ONLINE";
    }

    if (order.financeFlags?.onlinePaymentCaptured) {
      await session.commitTransaction();
      return order;
    }

    const grandTotal = roundCurrency(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0);
    const credit = await creditWallet({
      ownerType: OWNER_TYPE.ADMIN,
      ownerId: null,
      amount: grandTotal,
      bucket: "available",
      session,
    });

    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: credit.wallet._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: LEDGER_TRANSACTION_TYPE.ORDER_ONLINE_PAYMENT_CAPTURED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: grandTotal,
        paymentMode: "ONLINE",
        metadata: {
          ...metadata,
          gatewayTransactionId: transactionId || undefined,
        },
        description: "Online payment captured from customer",
        reference: order.orderId,
        balanceBefore: credit.before,
        balanceAfter: credit.after,
      },
      { session },
    );

    order.financeFlags = {
      ...(order.financeFlags || {}),
      onlinePaymentCaptured: true,
    };
    order.paymentStatus = ORDER_PAYMENT_STATUS.PAID;
    order.payment = {
      ...(order.payment || {}),
      method: "online",
      status: "completed",
      transactionId: transactionId || order.payment?.transactionId,
    };

    await createFinanceAuditLog(
      {
        action: "ONLINE_PAYMENT_VERIFIED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: actorId || null,
        orderId: order._id,
        metadata: {
          amount: grandTotal,
          gatewayTransactionId: transactionId || null,
        },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function handleCodOrderFinance(
  orderOrId,
  { amount = null, deliveryPartnerId = null, actorId = null } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.paymentMode === "ONLINE") {
      throw new Error("COD collection is not allowed for ONLINE orders");
    }

    if (order.paymentMode !== "COD") {
      order.paymentMode = "COD";
    }

    const isDelivered =
      order.status === "delivered" || order.orderStatus === "delivered";
    if (!isDelivered) {
      throw new Error("COD can only be collected after order delivery");
    }

    if (order.financeFlags?.codMarkedCollected) {
      await session.commitTransaction();
      return order;
    }

    if (!order.deliveryBoy && deliveryPartnerId) {
      order.deliveryBoy = deliveryPartnerId;
      order.deliveryPartner = deliveryPartnerId;
    }
    const partnerId = order.deliveryBoy || deliveryPartnerId;
    if (!partnerId) {
      throw new Error("Delivery partner is required for COD collection");
    }

    const codAmountGross = roundCurrency(
      amount == null ? order.paymentBreakdown?.grandTotal || order.pricing?.total || 0 : amount,
    );
    if (codAmountGross <= 0) {
      throw new Error("COD collection amount must be greater than 0");
    }

    // Requirement: system float (COD) should track remittable cash with delivery partners,
    // i.e. gross order amount minus delivery partner commission.
    const deliveryPartnerCommission = roundCurrency(
      order.paymentBreakdown?.riderPayoutTotal || 0,
    );
    const codAmountNet = roundCurrency(
      Math.max(codAmountGross - deliveryPartnerCommission, 0),
    );

    await updateCashInHand({
      ownerType: OWNER_TYPE.DELIVERY_PARTNER,
      ownerId: partnerId,
      deltaAmount: codAmountNet,
      session,
    });

    order.paymentBreakdown = {
      ...(order.paymentBreakdown || {}),
      codCollectedAmount: roundCurrency(
        (order.paymentBreakdown?.codCollectedAmount || 0) + codAmountNet,
      ),
      codRemittedAmount: roundCurrency(order.paymentBreakdown?.codRemittedAmount || 0),
      codPendingAmount: roundCurrency(
        (order.paymentBreakdown?.codCollectedAmount || 0) +
          codAmountNet -
          (order.paymentBreakdown?.codRemittedAmount || 0),
      ),
    };

    order.paymentStatus = ORDER_PAYMENT_STATUS.CASH_COLLECTED;
    order.payment = {
      ...(order.payment || {}),
      method: "cash",
      status: "completed",
    };
    order.financeFlags = {
      ...(order.financeFlags || {}),
      codMarkedCollected: true,
    };

    const riderWallet = await getOrCreateWallet(
      OWNER_TYPE.DELIVERY_PARTNER,
      partnerId,
      { session },
    );
    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: riderWallet._id,
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: partnerId,
        type: LEDGER_TRANSACTION_TYPE.ORDER_COD_COLLECTED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: codAmountNet,
        paymentMode: "COD",
        description: "COD cash added to system float (net of rider commission)",
        reference: order.orderId,
      },
      { session },
    );

    await createFinanceAuditLog(
      {
        action: "COD_MARKED_COLLECTED",
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: actorId || partnerId,
        orderId: order._id,
        metadata: {
          amountGross: codAmountGross,
          deliveryPartnerCommission,
          amountNet: codAmountNet,
          deliveryPartnerId: String(partnerId),
        },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function settleDeliveredOrder(orderOrId, { actorId = null } = {}) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.status !== "delivered") {
      order.status = "delivered";
    }
    order.orderStatus = "delivered";
    if (!order.deliveredAt) {
      order.deliveredAt = new Date();
    }

    if (!order.returnEligibleAt || !order.returnWindowExpiresAt) {
      const { eligibleAt, windowExpiresAt } = computeReturnWindowDates(order.deliveredAt);
      order.returnEligibleAt = order.returnEligibleAt || eligibleAt;
      order.returnWindowExpiresAt = order.returnWindowExpiresAt || windowExpiresAt;
      order.returnDeadline = order.returnDeadline || windowExpiresAt;
    }

    if (order.paymentMode === "ONLINE" && !order.financeFlags?.onlinePaymentCaptured) {
      throw new Error("Cannot settle delivered online order before payment capture");
    }

    if (order.financeFlags?.deliveredSettlementApplied) {
      await session.commitTransaction();
      return order;
    }

    const now = new Date();
    const holdSellerPayout =
      order.returnWindowExpiresAt instanceof Date && order.returnWindowExpiresAt > now;

    await createPendingSellerPayout(order, { session, actorId });

    if (holdSellerPayout) {
      order.financeFlags = {
        ...(order.financeFlags || {}),
        sellerPayoutHeld: true,
      };
      order.settlementStatus = {
        ...(order.settlementStatus || {}),
        sellerPayout: "HOLD",
      };
    }
    await createPendingRiderPayout(order, { session, actorId });
    await creditAdminEarning(order, { session, actorId });

    order.financeFlags = {
      ...(order.financeFlags || {}),
      deliveredSettlementApplied: true,
    };

    order.settlementStatus = computeOverallSettlement(order);

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function reconcileCodCash(
  orderOrId,
  amount,
  deliveryPartnerId,
  { actorId = null, metadata = {} } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);
    const partnerId = deliveryPartnerId || order.deliveryBoy;
    if (!partnerId) {
      throw new Error("Delivery partner is required for reconciliation");
    }
    if (order.paymentMode !== "COD") {
      throw new Error("COD reconciliation is only allowed for COD orders");
    }

    const requested = roundCurrency(amount || 0);
    if (requested <= 0) {
      throw new Error("Reconciliation amount must be greater than 0");
    }

    const codCollected = roundCurrency(order.paymentBreakdown?.codCollectedAmount || 0);
    const codRemitted = roundCurrency(order.paymentBreakdown?.codRemittedAmount || 0);
    const codPending = roundCurrency(codCollected - codRemitted);
    if (codPending <= 0) {
      throw new Error("No COD pending amount for this order");
    }
    if (requested > codPending) {
      throw new Error("Reconciliation amount exceeds COD pending amount");
    }

    await updateCashInHand({
      ownerType: OWNER_TYPE.DELIVERY_PARTNER,
      ownerId: partnerId,
      deltaAmount: -requested,
      session,
    });

    const adminCredit = await creditWallet({
      ownerType: OWNER_TYPE.ADMIN,
      ownerId: null,
      amount: requested,
      bucket: "available",
      session,
    });

    const riderWallet = await getOrCreateWallet(
      OWNER_TYPE.DELIVERY_PARTNER,
      partnerId,
      { session },
    );

    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: riderWallet._id,
        actorType: OWNER_TYPE.DELIVERY_PARTNER,
        actorId: partnerId,
        type: LEDGER_TRANSACTION_TYPE.COD_REMITTED,
        direction: LEDGER_DIRECTION.DEBIT,
        amount: requested,
        paymentMode: "COD",
        metadata,
        description: "COD remitted by delivery partner",
        reference: order.orderId,
      },
      { session },
    );

    await createLedgerEntry(
      {
        orderId: order._id,
        walletId: adminCredit.wallet._id,
        actorType: OWNER_TYPE.ADMIN,
        actorId: null,
        type: LEDGER_TRANSACTION_TYPE.COD_REMITTED,
        direction: LEDGER_DIRECTION.CREDIT,
        amount: requested,
        paymentMode: "COD",
        metadata,
        description: "COD remittance credited to admin wallet",
        reference: order.orderId,
        balanceBefore: adminCredit.before,
        balanceAfter: adminCredit.after,
      },
      { session },
    );

    const nextRemitted = addMoney(codRemitted, requested);
    const nextPending = roundCurrency(codCollected - nextRemitted);

    order.paymentBreakdown = {
      ...(order.paymentBreakdown || {}),
      codCollectedAmount: codCollected,
      codRemittedAmount: nextRemitted,
      codPendingAmount: nextPending,
    };

    order.paymentStatus =
      nextPending <= 0
        ? ORDER_PAYMENT_STATUS.COD_RECONCILED
        : ORDER_PAYMENT_STATUS.PARTIALLY_REMITTED;

    if (nextPending <= 0) {
      order.settlementStatus = {
        ...(order.settlementStatus || {}),
        reconciledAt: new Date(),
      };
    }

    await createFinanceAuditLog(
      {
        action: "COD_RECONCILED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: actorId || null,
        orderId: order._id,
        metadata: {
          amount: requested,
          deliveryPartnerId: String(partnerId),
          codRemittedAmount: nextRemitted,
          codPendingAmount: nextPending,
        },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}

export async function reverseOrderFinanceOnCancellation(
  orderOrId,
  { actorId = null, reason = "Order cancelled before settlement" } = {},
) {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();
    const order = await findOrderForUpdate(orderOrId, session);

    if (order.paymentMode === "ONLINE" && order.financeFlags?.onlinePaymentCaptured) {
      const refundAmount = roundCurrency(order.paymentBreakdown?.grandTotal || 0);
      if (refundAmount > 0) {
        const debitResult = await debitWallet({
          ownerType: OWNER_TYPE.ADMIN,
          ownerId: null,
          amount: refundAmount,
          bucket: "available",
          session,
        });

        await createLedgerEntry(
          {
            orderId: order._id,
            walletId: debitResult.wallet._id,
            actorType: OWNER_TYPE.ADMIN,
            actorId: null,
            type: LEDGER_TRANSACTION_TYPE.REFUND,
            direction: LEDGER_DIRECTION.DEBIT,
            amount: refundAmount,
            paymentMode: "ONLINE",
            description: reason,
            reference: order.orderId,
            balanceBefore: debitResult.before,
            balanceAfter: debitResult.after,
          },
          { session },
        );
      }
      order.paymentStatus = ORDER_PAYMENT_STATUS.REFUNDED;
    }

    // NEW: Refund Wallet Amount Used
    const walletUsed = roundCurrency(order.pricing?.walletAmount || order.paymentBreakdown?.walletAmount || 0);
    if (walletUsed > 0) {
      await creditWallet({
        ownerType: OWNER_TYPE.CUSTOMER,
        ownerId: order.customer,
        amount: walletUsed,
        bucket: "available",
        session,
      });

      const customerWallet = await getOrCreateWallet(OWNER_TYPE.CUSTOMER, order.customer, { session });
      await createLedgerEntry(
        {
          orderId: order._id,
          walletId: customerWallet._id,
          actorType: OWNER_TYPE.CUSTOMER,
          actorId: order.customer,
          type: LEDGER_TRANSACTION_TYPE.WALLET_REFUND,
          direction: LEDGER_DIRECTION.CREDIT,
          amount: walletUsed,
          paymentMode: "WALLET",
          description: `Refund for wallet payment: ${reason}`,
          reference: order.orderId,
        },
        { session },
      );
    }

    order.settlementStatus = {
      ...(order.settlementStatus || {}),
      overall: ORDER_SETTLEMENT_STATUS.CANCELLED,
      sellerPayout: "NOT_APPLICABLE",
      riderPayout: "NOT_APPLICABLE",
    };

    await createFinanceAuditLog(
      {
        action: "FINANCE_ADJUSTMENT_APPLIED",
        actorType: OWNER_TYPE.ADMIN,
        actorId: actorId || null,
        orderId: order._id,
        metadata: { reason },
      },
      { session },
    );

    await order.save({ session });
    await session.commitTransaction();
    return order;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
