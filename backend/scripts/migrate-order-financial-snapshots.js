import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import { ORDER_PAYMENT_STATUS } from "../app/constants/finance.js";

dotenv.config();

function inferPaymentMode(order) {
  const method = String(order?.payment?.method || "").toLowerCase();
  return method === "online" ? "ONLINE" : "COD";
}

function inferPaymentStatus(order, paymentMode) {
  const status = String(order?.payment?.status || "").toLowerCase();
  if (paymentMode === "ONLINE") {
    return status === "completed" ? ORDER_PAYMENT_STATUS.PAID : ORDER_PAYMENT_STATUS.CREATED;
  }
  if (status === "completed") {
    return ORDER_PAYMENT_STATUS.CASH_COLLECTED;
  }
  return ORDER_PAYMENT_STATUS.PENDING_CASH_COLLECTION;
}

function buildBackfillBreakdown(order) {
  const subtotal = Number(order?.pricing?.subtotal || 0);
  const deliveryFee = Number(order?.pricing?.deliveryFee || 0);
  const handlingFee = Number(order?.pricing?.platformFee || 0);
  const discount = Number(order?.pricing?.discount || 0);
  const tax = Number(order?.pricing?.gst || 0);
  const total = Number(order?.pricing?.total || subtotal + deliveryFee + handlingFee - discount + tax);

  const isCod = inferPaymentMode(order) === "COD";
  const isDelivered = String(order?.status || "").toLowerCase() === "delivered";
  const codCollectedAmount = isCod && isDelivered ? total : 0;

  return {
    currency: "INR",
    productSubtotal: subtotal,
    deliveryFeeCharged: deliveryFee,
    handlingFeeCharged: handlingFee,
    discountTotal: discount,
    taxTotal: tax,
    grandTotal: total,
    sellerPayoutTotal: subtotal,
    adminProductCommissionTotal: 0,
    riderPayoutBase: 0,
    riderPayoutDistance: 0,
    riderPayoutBonus: 0,
    riderPayoutTotal: 0,
    platformLogisticsMargin: deliveryFee + handlingFee,
    platformTotalEarning: deliveryFee + handlingFee,
    codCollectedAmount,
    codRemittedAmount: 0,
    codPendingAmount: codCollectedAmount,
    distanceKmActual: 0,
    distanceKmRounded: 0,
    snapshots: {
      deliverySettings: {},
      categoryCommissionSettings: [],
      handlingFeeStrategy: "legacy_backfill",
      handlingCategoryUsed: {},
    },
    lineItems: [],
  };
}

async function migrate() {
  await connectDB();

  const cursor = Order.find({
    $or: [
      { paymentBreakdown: { $exists: false } },
      { "paymentBreakdown.grandTotal": { $exists: false } },
    ],
  }).cursor();

  let processed = 0;
  let updated = 0;

  for await (const order of cursor) {
    processed += 1;
    const paymentMode = inferPaymentMode(order);
    const paymentStatus = inferPaymentStatus(order, paymentMode);
    const paymentBreakdown = buildBackfillBreakdown(order);

    order.paymentMode = paymentMode;
    order.paymentStatus = paymentStatus;
    order.orderStatus = order.status || "pending";
    order.paymentBreakdown = paymentBreakdown;
    order.distanceSnapshot = {
      distanceKmActual: paymentBreakdown.distanceKmActual,
      distanceKmRounded: paymentBreakdown.distanceKmRounded,
      source: "legacy_backfill",
    };
    order.pricingSnapshot = {
      deliverySettings: {},
      categoryCommissionSettings: [],
      handlingFeeStrategy: "legacy_backfill",
      handlingCategoryUsed: {},
    };
    order.financeFlags = {
      onlinePaymentCaptured: paymentMode === "ONLINE" && paymentStatus === ORDER_PAYMENT_STATUS.PAID,
      codMarkedCollected: paymentMode === "COD" && paymentStatus === ORDER_PAYMENT_STATUS.CASH_COLLECTED,
      deliveredSettlementApplied: order.status === "delivered",
      sellerPayoutQueued: false,
      riderPayoutQueued: false,
      adminEarningCredited: false,
    };
    order.settlementStatus = {
      overall: "PENDING",
      sellerPayout: "PENDING",
      riderPayout: "PENDING",
      adminEarningCredited: false,
      reconciledAt: null,
    };

    await order.save();
    updated += 1;

    if (updated % 100 === 0) {
      console.log(`[migrate-order-financial-snapshots] updated=${updated}`);
    }
  }

  console.log(`[migrate-order-financial-snapshots] processed=${processed} updated=${updated}`);
  process.exit(0);
}

migrate().catch((error) => {
  console.error("[migrate-order-financial-snapshots] failed:", error);
  process.exit(1);
});
