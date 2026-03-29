import crypto from "crypto";
import mongoose from "mongoose";
import Razorpay from "razorpay";
import Order from "../models/order.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import Payment from "../models/payment.js";
import PaymentWebhookEvent from "../models/paymentWebhookEvent.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import {
  PAYMENT_EVENT_SOURCE,
  PAYMENT_GATEWAY,
  PAYMENT_STATUS,
  canTransitionPaymentStatus,
} from "../constants/payment.js";
import { handleOnlineOrderFinance } from "./finance/orderFinanceService.js";
import { DEFAULT_SELLER_TIMEOUT_MS, WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { afterPlaceOrderV2 } from "./orderWorkflowService.js";
import { releaseReservedStockForOrder } from "./stockService.js";

let _razorpayClient = null;

function getRazorpayClient() {
  if (_razorpayClient) return _razorpayClient;
  _razorpayClient = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });
  return _razorpayClient;
}

function sanitizeGatewayPayload(payload = {}) {
  return {
    id: payload.id,
    entity: payload.entity,
    amount: payload.amount,
    currency: payload.currency,
    status: payload.status,
    receipt: payload.receipt,
    order_id: payload.order_id,
    payment_id: payload.payment_id,
    created_at: payload.created_at,
    notes: payload.notes || {},
    error_code: payload.error_code,
    error_description: payload.error_description,
  };
}

function toOrderLookup(orderRef) {
  if (!orderRef) return null;
  const trimmed = String(orderRef).trim();
  if (!trimmed) return null;
  if (mongoose.Types.ObjectId.isValid(trimmed)) {
    return {
      $or: [{ _id: new mongoose.Types.ObjectId(trimmed) }, { orderId: trimmed }],
    };
  }
  return { orderId: trimmed };
}

function extractCheckoutGroupId(orderRef) {
  const trimmed = String(orderRef || "").trim().toUpperCase();
  if (!trimmed) return null;
  if (trimmed.startsWith("CHK-") || trimmed.startsWith("CG-")) {
    return trimmed;
  }
  return null;
}

async function resolvePaymentTarget(orderRef) {
  const checkoutGroupId = extractCheckoutGroupId(orderRef);
  if (checkoutGroupId) {
    const checkoutGroup = await CheckoutGroup.findOne({ checkoutGroupId }).lean();
    if (!checkoutGroup) {
      const err = new Error("Checkout group not found");
      err.statusCode = 404;
      throw err;
    }
    const orders = await Order.find({ checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
    if (orders.length === 0) {
      const err = new Error("Checkout group has no orders");
      err.statusCode = 404;
      throw err;
    }
    return {
      checkoutGroupId,
      checkoutGroup,
      orders,
      primaryOrder: orders[0],
      publicOrderRef: checkoutGroupId,
    };
  }

  const query = toOrderLookup(orderRef);
  if (!query) {
    const err = new Error("orderRef is required");
    err.statusCode = 400;
    throw err;
  }

  const order = await Order.findOne(query);
  if (!order) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  if (order.checkoutGroupId) {
    const orders = await Order.find({ checkoutGroupId: order.checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
    const checkoutGroup = await CheckoutGroup.findOne({
      checkoutGroupId: order.checkoutGroupId,
    }).lean();
    return {
      checkoutGroupId: order.checkoutGroupId,
      checkoutGroup,
      orders: orders.length > 0 ? orders : [order],
      primaryOrder: order,
      publicOrderRef: order.checkoutGroupId,
    };
  }

  return {
    checkoutGroupId: null,
    checkoutGroup: null,
    orders: [order],
    primaryOrder: order,
    publicOrderRef: order.orderId,
  };
}

function validatePaymentEligibility(target, userId) {
  if (!target?.orders?.length) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }

  for (const order of target.orders) {
    if (String(order.customer) !== String(userId)) {
      const err = new Error("You are not allowed to pay for this order");
      err.statusCode = 403;
      throw err;
    }
    if (order.paymentMode !== "ONLINE") {
      const err = new Error("Payment is allowed only for ONLINE orders");
      err.statusCode = 400;
      throw err;
    }
    if (
      order.status === "cancelled" ||
      order.workflowStatus === WORKFLOW_STATUS.CANCELLED ||
      order.status === "delivered" ||
      order.workflowStatus === WORKFLOW_STATUS.DELIVERED
    ) {
      const err = new Error("Payment is not allowed for this checkout state");
      err.statusCode = 409;
      throw err;
    }
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.PAID) {
      const err = new Error("Order is already paid");
      err.statusCode = 409;
      throw err;
    }
    if (order.paymentStatus === ORDER_PAYMENT_STATUS.REFUNDED) {
      const err = new Error("Order payment has already been refunded");
      err.statusCode = 409;
      throw err;
    }
  }
}

function getPayableAmountPaise(target) {
  const amountRupees = target.orders.reduce(
    (sum, order) =>
      sum + Number(order?.paymentBreakdown?.grandTotal ?? order?.pricing?.total ?? 0),
    0,
  );
  if (!Number.isFinite(amountRupees) || amountRupees <= 0) {
    const err = new Error("Unable to determine payable amount for this checkout");
    err.statusCode = 400;
    throw err;
  }
  return Math.round(amountRupees * 100);
}

function signatureForRazorpay({ orderId, paymentId, secret }) {
  const body = `${orderId}|${paymentId}`;
  return crypto.createHmac("sha256", secret).update(body).digest("hex");
}

function verifyRazorpayWebhookSignature({ rawBody, signature, secret }) {
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = String(signature || "");
  if (received.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(received));
}

function mapRazorpayStatusToInternal(status) {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "captured") return PAYMENT_STATUS.CAPTURED;
  if (normalized === "authorized") return PAYMENT_STATUS.AUTHORIZED;
  if (normalized === "failed") return PAYMENT_STATUS.FAILED;
  if (normalized === "cancelled" || normalized === "canceled") return PAYMENT_STATUS.CANCELLED;
  if (normalized === "refunded") return PAYMENT_STATUS.REFUNDED;
  if (normalized === "created") return PAYMENT_STATUS.PENDING;
  return PAYMENT_STATUS.PENDING;
}

function paymentStatusToOrderPaymentStatus(status) {
  if (status === PAYMENT_STATUS.CAPTURED) return ORDER_PAYMENT_STATUS.PAID;
  if (status === PAYMENT_STATUS.FAILED) return ORDER_PAYMENT_STATUS.FAILED;
  if (status === PAYMENT_STATUS.REFUNDED) return ORDER_PAYMENT_STATUS.REFUNDED;
  return ORDER_PAYMENT_STATUS.CREATED;
}

async function transitionPaymentState(payment, {
  nextStatus,
  source,
  reason = "",
  gatewayPaymentId = null,
  gatewaySignature = null,
  rawGatewayResponse = null,
}) {
  const currentStatus = payment.status || PAYMENT_STATUS.CREATED;
  if (currentStatus === nextStatus) {
    if (gatewayPaymentId && !payment.gatewayPaymentId) {
      payment.gatewayPaymentId = gatewayPaymentId;
    }
    if (gatewaySignature && !payment.gatewaySignature) {
      payment.gatewaySignature = gatewaySignature;
    }
    if (rawGatewayResponse) {
      payment.rawGatewayResponse = {
        ...(payment.rawGatewayResponse || {}),
        ...sanitizeGatewayPayload(rawGatewayResponse),
      };
    }
    await payment.save();
    return payment;
  }

  if (!canTransitionPaymentStatus(currentStatus, nextStatus)) {
    const err = new Error(`Invalid payment transition ${currentStatus} -> ${nextStatus}`);
    err.statusCode = 409;
    throw err;
  }

  payment.status = nextStatus;
  if (gatewayPaymentId) payment.gatewayPaymentId = gatewayPaymentId;
  if (gatewaySignature) payment.gatewaySignature = gatewaySignature;
  if (rawGatewayResponse) {
    payment.rawGatewayResponse = {
      ...(payment.rawGatewayResponse || {}),
      ...sanitizeGatewayPayload(rawGatewayResponse),
    };
  }
  payment.statusHistory.push({
    fromStatus: currentStatus,
    toStatus: nextStatus,
    source,
    reason,
    changedAt: new Date(),
  });
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    payment.capturedAt = new Date();
  } else if (nextStatus === PAYMENT_STATUS.FAILED) {
    payment.failedAt = new Date();
    payment.failureReason = reason || payment.failureReason;
  } else if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    payment.refundedAt = new Date();
  }
  await payment.save();
  return payment;
}

async function moveOrderToSellerPendingAfterPayment(orderId) {
  const now = new Date();
  const sellerPendingUntil = new Date(now.getTime() + DEFAULT_SELLER_TIMEOUT_MS());
  const updatedOrder = await Order.findOneAndUpdate(
    {
      _id: orderId,
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.CREATED,
      paymentMode: "ONLINE",
    },
    {
      $set: {
        workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
        sellerPendingExpiresAt: sellerPendingUntil,
        expiresAt: sellerPendingUntil,
      },
    },
    { new: true },
  );
  if (updatedOrder) {
    void afterPlaceOrderV2(updatedOrder).catch((error) => {
      console.warn("[moveOrderToSellerPendingAfterPayment] afterPlaceOrderV2:", error.message);
    });
  }
}

async function getRelatedOrdersForPayment(payment) {
  if (Array.isArray(payment.orderIds) && payment.orderIds.length > 0) {
    return Order.find({ _id: { $in: payment.orderIds } })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
  }
  if (payment.checkoutGroupId) {
    return Order.find({ checkoutGroupId: payment.checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });
  }
  if (payment.order) {
    const order = await Order.findById(payment.order);
    return order ? [order] : [];
  }
  return [];
}

async function updateCheckoutGroupPaymentStatus(checkoutGroupId, nextStatus) {
  if (!checkoutGroupId) return;
  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          status: "PAID",
          paymentStatus: ORDER_PAYMENT_STATUS.PAID,
          "stockReservation.status": "COMMITTED",
        },
      },
    );
    return;
  }
  if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          status: "CANCELLED",
          paymentStatus: ORDER_PAYMENT_STATUS.FAILED,
          "stockReservation.status": "RELEASED",
          "stockReservation.releasedAt": new Date(),
        },
      },
    );
    return;
  }
  if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    await CheckoutGroup.updateOne(
      { checkoutGroupId },
      {
        $set: {
          paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
          status: "CANCELLED",
        },
      },
    );
  }
}

async function handleOrderSideEffectsFromPaymentStatus(payment, nextStatus, reason) {
  const orders = await getRelatedOrdersForPayment(payment);
  if (!orders.length) return;

  if (nextStatus === PAYMENT_STATUS.CAPTURED) {
    for (const order of orders) {
      await handleOnlineOrderFinance(order._id, {
        actorId: null,
        transactionId: payment.gatewayPaymentId || "",
        metadata: {
          paymentId: payment._id.toString(),
          checkoutGroupId: payment.checkoutGroupId || null,
        },
      });
      await moveOrderToSellerPendingAfterPayment(order._id);
    }
    await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, nextStatus);
    return;
  }

  if (nextStatus === PAYMENT_STATUS.FAILED || nextStatus === PAYMENT_STATUS.CANCELLED) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();
      for (const order of orders) {
        const orderForUpdate = await Order.findById(order._id, null, { session });
        if (
          orderForUpdate &&
          orderForUpdate.workflowStatus === WORKFLOW_STATUS.CREATED &&
          orderForUpdate.status !== "cancelled"
        ) {
          await releaseReservedStockForOrder(orderForUpdate, {
            session,
            reason: reason || "Payment failed",
          });
          orderForUpdate.status = "cancelled";
          orderForUpdate.orderStatus = "cancelled";
          orderForUpdate.workflowStatus = WORKFLOW_STATUS.CANCELLED;
          orderForUpdate.cancelledBy = "system";
          orderForUpdate.cancelReason = reason || "Payment failed";
          orderForUpdate.paymentStatus = ORDER_PAYMENT_STATUS.FAILED;
          await orderForUpdate.save({ session });
        }
      }
      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }
    await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, nextStatus);
    return;
  }

  if (nextStatus === PAYMENT_STATUS.REFUNDED) {
    await Order.updateMany(
      { _id: { $in: orders.map((order) => order._id) } },
      {
        $set: {
          paymentStatus: ORDER_PAYMENT_STATUS.REFUNDED,
          "payment.status": "refunded",
        },
      },
    );
    await updateCheckoutGroupPaymentStatus(payment.checkoutGroupId, nextStatus);
    return;
  }

  await Order.updateMany(
    { _id: { $in: orders.map((order) => order._id) } },
    {
      $set: {
        paymentStatus: paymentStatusToOrderPaymentStatus(nextStatus),
      },
    },
  );
}

export async function createPaymentOrderForOrderRef({
  orderRef,
  userId,
  idempotencyKey = null,
  correlationId = null,
}) {
  const target = await resolvePaymentTarget(orderRef);
  validatePaymentEligibility(target, userId);
  const primaryOrder = target.primaryOrder;
  const paymentScopeQuery = target.checkoutGroupId
    ? { checkoutGroupId: target.checkoutGroupId }
    : { order: primaryOrder._id };

  if (idempotencyKey) {
    const existingForKey = await Payment.findOne({
      ...paymentScopeQuery,
      idempotencyKey,
    });
    if (existingForKey) {
      return {
        payment: existingForKey,
        gatewayOrder: {
          id: existingForKey.gatewayOrderId,
          amount: existingForKey.amount,
          currency: existingForKey.currency,
        },
        duplicate: true,
      };
    }
  }

  const existingOpenPayment = await Payment.findOne({
    ...paymentScopeQuery,
    status: {
      $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING, PAYMENT_STATUS.AUTHORIZED],
    },
  }).sort({ createdAt: -1 });

  if (existingOpenPayment) {
    return {
      payment: existingOpenPayment,
      gatewayOrder: {
        id: existingOpenPayment.gatewayOrderId,
        amount: existingOpenPayment.amount,
        currency: existingOpenPayment.currency,
      },
      duplicate: true,
    };
  }

  const amountPaise = getPayableAmountPaise(target);
  const currency = String(primaryOrder?.paymentBreakdown?.currency || "INR").toUpperCase();
  const attemptCount = (await Payment.countDocuments(paymentScopeQuery)) + 1;

  const gatewayOrder = await getRazorpayClient().orders.create({
    amount: amountPaise,
    currency,
    receipt: target.publicOrderRef,
    notes: {
      publicOrderId: target.publicOrderRef,
      orderMongoId: String(primaryOrder._id),
      customerId: String(primaryOrder.customer),
      checkoutGroupId: target.checkoutGroupId || "",
      orderCount: String(target.orders.length),
    },
  });

  const payment = await Payment.create({
    order: primaryOrder._id,
    orderIds: target.orders.map((order) => order._id),
    checkoutGroupId: target.checkoutGroupId || null,
    publicOrderId: target.publicOrderRef,
    customer: primaryOrder.customer,
    gatewayName: PAYMENT_GATEWAY.RAZORPAY,
    gatewayOrderId: gatewayOrder.id,
    amount: amountPaise,
    currency,
    status: PAYMENT_STATUS.PENDING,
    attemptCount,
    idempotencyKey: idempotencyKey || undefined,
    correlationId,
    rawGatewayResponse: sanitizeGatewayPayload(gatewayOrder),
    statusHistory: [
      {
        fromStatus: PAYMENT_STATUS.CREATED,
        toStatus: PAYMENT_STATUS.PENDING,
        source: PAYMENT_EVENT_SOURCE.SYSTEM,
        reason: "Gateway order created",
      },
    ],
  });

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "payment_order_created",
      correlationId,
      publicOrderId: payment.publicOrderId,
      paymentId: payment._id.toString(),
      gatewayOrderId: payment.gatewayOrderId,
      amount: payment.amount,
    }),
  );

  return { payment, gatewayOrder, duplicate: false };
}

export async function verifyClientPaymentCallback({
  orderRef,
  userId,
  gatewayOrderId,
  gatewayPaymentId,
  gatewaySignature,
  correlationId = null,
}) {
  const target = await resolvePaymentTarget(orderRef);
  validatePaymentEligibility(target, userId);

  const paymentLookup = {
    gatewayOrderId,
    customer: userId,
    ...(target.checkoutGroupId
      ? { checkoutGroupId: target.checkoutGroupId }
      : { order: target.primaryOrder._id }),
  };
  const payment = await Payment.findOne(paymentLookup);
  if (!payment) {
    const err = new Error("Payment attempt not found");
    err.statusCode = 404;
    throw err;
  }

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    const err = new Error("Payment gateway secret is not configured");
    err.statusCode = 500;
    throw err;
  }

  const expectedSignature = signatureForRazorpay({
    orderId: gatewayOrderId,
    paymentId: gatewayPaymentId,
    secret,
  });
  const signatureIsValid = expectedSignature === gatewaySignature;

  if (!signatureIsValid) {
    await transitionPaymentState(payment, {
      nextStatus: payment.status,
      source: PAYMENT_EVENT_SOURCE.CLIENT_VERIFY,
      reason: "Invalid signature in client callback",
      gatewayPaymentId,
    });
    const err = new Error("Payment verification failed due to invalid signature");
    err.statusCode = 400;
    throw err;
  }

  const gatewayPayment = await getRazorpayClient().payments.fetch(gatewayPaymentId);
  const nextStatus = mapRazorpayStatusToInternal(gatewayPayment.status);
  await transitionPaymentState(payment, {
    nextStatus,
    source: PAYMENT_EVENT_SOURCE.CLIENT_VERIFY,
    reason: "Client callback signature verified",
    gatewayPaymentId,
    gatewaySignature,
    rawGatewayResponse: gatewayPayment,
  });

  await handleOrderSideEffectsFromPaymentStatus(
    payment,
    nextStatus,
    gatewayPayment.error_description || "",
  );

  payment.correlationId = correlationId || payment.correlationId;
  await payment.save();

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "payment_client_verified",
      correlationId,
      publicOrderId: payment.publicOrderId,
      paymentId: payment._id.toString(),
      status: nextStatus,
    }),
  );

  return {
    payment,
    status: nextStatus,
    signatureIsValid: true,
  };
}

function readWebhookEventInfo(eventPayload = {}) {
  const paymentEntity = eventPayload?.payload?.payment?.entity || {};
  const refundEntity = eventPayload?.payload?.refund?.entity || {};

  const gatewayOrderId = paymentEntity.order_id || refundEntity.order_id || null;
  const gatewayPaymentId = paymentEntity.id || refundEntity.payment_id || null;
  const rawStatus = refundEntity.id ? "refunded" : paymentEntity.status;
  const failureReason =
    paymentEntity.error_description || paymentEntity.error_reason || "";

  return {
    gatewayOrderId,
    gatewayPaymentId,
    rawStatus,
    failureReason,
    rawEntity: refundEntity.id ? refundEntity : paymentEntity,
  };
}

export async function processRazorpayWebhook({
  rawBody,
  signature,
  eventId,
  correlationId = null,
}) {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    const err = new Error("Razorpay webhook secret is not configured");
    err.statusCode = 500;
    throw err;
  }

  const signatureValid = verifyRazorpayWebhookSignature({
    rawBody,
    signature,
    secret: webhookSecret,
  });
  if (!signatureValid) {
    const err = new Error("Invalid webhook signature");
    err.statusCode = 400;
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    const err = new Error("Invalid webhook payload");
    err.statusCode = 400;
    throw err;
  }

  const safeEventId =
    eventId ||
    `${payload.event || "unknown"}:${crypto
      .createHash("sha256")
      .update(rawBody)
      .digest("hex")
      .slice(0, 32)}`;

  const payloadHash = crypto.createHash("sha256").update(rawBody).digest("hex");
  const eventType = String(payload.event || "unknown");

  try {
    await PaymentWebhookEvent.create({
      eventId: safeEventId,
      gatewayName: PAYMENT_GATEWAY.RAZORPAY,
      eventType,
      payloadHash,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return { duplicate: true, accepted: true };
    }
    throw error;
  }

  const { gatewayOrderId, gatewayPaymentId, rawStatus, failureReason, rawEntity } =
    readWebhookEventInfo(payload);
  if (!gatewayOrderId) {
    return { accepted: true, ignored: true, reason: "Missing gateway order id" };
  }

  const payment = await Payment.findOne({ gatewayOrderId });
  if (!payment) {
    return { accepted: true, ignored: true, reason: "Payment attempt not found" };
  }

  const nextStatus = mapRazorpayStatusToInternal(rawStatus);
  await transitionPaymentState(payment, {
    nextStatus,
    source: PAYMENT_EVENT_SOURCE.WEBHOOK,
    reason: failureReason || eventType,
    gatewayPaymentId,
    rawGatewayResponse: rawEntity,
  });

  payment.correlationId = correlationId || payment.correlationId;
  await payment.save();

  await PaymentWebhookEvent.updateOne(
    { eventId: safeEventId },
    {
      $set: {
        payment: payment._id,
        publicOrderId: payment.publicOrderId,
      },
    },
  );

  await handleOrderSideEffectsFromPaymentStatus(payment, nextStatus, failureReason);

  return {
    accepted: true,
    duplicate: false,
    paymentStatus: nextStatus,
    publicOrderId: payment.publicOrderId,
  };
}
