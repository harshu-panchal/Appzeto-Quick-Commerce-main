import crypto from "crypto";
import mongoose from "mongoose";
import { StandardCheckoutClient, Env, StandardCheckoutPayRequest } from '@phonepe-pg/pg-sdk-node';

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
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

let phonePeClient = null;
const MAX_MERCHANT_ORDER_ID_LENGTH = 63;

function getPhonePeClient() {
  if (phonePeClient) return phonePeClient;

  const clientId = String(process.env.PHONEPE_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PHONEPE_CLIENT_SECRET || "").trim();
  const clientVersion = parseInt(process.env.PHONEPE_CLIENT_VERSION || "1", 10);
  const isProd = String(process.env.PHONEPE_ENV || "").toUpperCase() === "PRODUCTION";

  if (!clientId || !clientSecret) {
    throw new Error("PhonePe credentials not configured");
  }

  phonePeClient = StandardCheckoutClient.getInstance(
    clientId,
    clientSecret,
    clientVersion,
    isProd ? Env.PRODUCTION : Env.SANDBOX
  );

  return phonePeClient;
}

function sanitizeGatewayPayload(payload = {}) {
  return {
    merchantOrderId: payload.merchantOrderId,
    transactionId: payload.transactionId,
    amount: payload.amount,
    state: payload.state,
    responseCode: payload.responseCode,
    paymentMode: payload.paymentMode,
    meta: payload.meta || {},
  };
}

function sanitizeMerchantOrderIdPart(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function buildGatewayMerchantOrderId(publicOrderRef, attemptCount = 1) {
  const normalizedBase = sanitizeMerchantOrderIdPart(publicOrderRef) || "ORDER";
  const suffix = `-A${Math.max(1, Number(attemptCount) || 1)}`;
  const maxBaseLength = MAX_MERCHANT_ORDER_ID_LENGTH - suffix.length;
  const truncatedBase = normalizedBase.slice(0, Math.max(1, maxBaseLength));
  return `${truncatedBase}${suffix}`;
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
    let orders = await Order.find({ checkoutGroupId })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 });

    if (orders.length === 0) {
      const fallbackClauses = [];
      if (Array.isArray(checkoutGroup.orderIds) && checkoutGroup.orderIds.length > 0) {
        fallbackClauses.push({ _id: { $in: checkoutGroup.orderIds } });
      }
      if (Array.isArray(checkoutGroup.publicOrderIds) && checkoutGroup.publicOrderIds.length > 0) {
        fallbackClauses.push({ orderId: { $in: checkoutGroup.publicOrderIds } });
      }

      if (fallbackClauses.length > 0) {
        orders = await Order.find({ $or: fallbackClauses })
          .sort({ checkoutGroupIndex: 1, createdAt: 1 });
      }
    }

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

function mapPhonePeStatusToInternal(state) {
  const normalized = String(state || "").toUpperCase();
  if (normalized === "COMPLETED") return PAYMENT_STATUS.CAPTURED;
  if (normalized === "FAILED") return PAYMENT_STATUS.FAILED;
  if (normalized === "PENDING" || normalized === "CREATED") return PAYMENT_STATUS.PENDING;
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
  rawGatewayResponse = null,
}) {
  const currentStatus = payment.status || PAYMENT_STATUS.CREATED;
  if (currentStatus === nextStatus) {
    if (gatewayPaymentId && !payment.gatewayPaymentId) {
      payment.gatewayPaymentId = gatewayPaymentId;
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
      emitNotificationEvent(NOTIFICATION_EVENTS.PAYMENT_SUCCESS, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });

      emitNotificationEvent(NOTIFICATION_EVENTS.NEW_ORDER, {
        orderId: order.orderId,
        sellerId: order.seller,
      });
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
    for (const order of orders) {
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        customerMessage: "Order was cancelled because payment failed.",
        sellerMessage: `Order #${order.orderId} was cancelled because payment failed.`,
      });
    }
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
    for (const order of orders) {
      emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
        orderId: order.orderId,
        checkoutGroupId: payment.checkoutGroupId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });
    }
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
        redirectUrl: existingForKey.rawGatewayResponse?.redirectUrl,
        duplicate: true,
      };
    }
  }

  const existingOpenPayment = await Payment.findOne({
    ...paymentScopeQuery,
    status: {
      $in: [PAYMENT_STATUS.CREATED, PAYMENT_STATUS.PENDING],
    },
  }).sort({ createdAt: -1 });

  if (existingOpenPayment && existingOpenPayment.rawGatewayResponse?.redirectUrl) {
    return {
      payment: existingOpenPayment,
      redirectUrl: existingOpenPayment.rawGatewayResponse.redirectUrl,
      duplicate: true,
    };
  }

  const amountPaise = getPayableAmountPaise(target);
  const currency = String(primaryOrder?.paymentBreakdown?.currency || "INR").toUpperCase();
  const attemptCount = (await Payment.countDocuments(paymentScopeQuery)) + 1;
  const merchantOrderId = buildGatewayMerchantOrderId(
    target.checkoutGroupId || target.publicOrderRef || crypto.randomUUID(),
    attemptCount,
  );

  const client = getPhonePeClient();
  const redirectUrl = `${process.env.FRONTEND_URL}/payment-status?merchantOrderId=${merchantOrderId}`;

  const request = StandardCheckoutPayRequest.builder()
    .merchantOrderId(merchantOrderId)
    .amount(amountPaise)
    .redirectUrl(redirectUrl)
    .build();

  const response = await client.pay(request);

  const paymentData = {
    order: primaryOrder._id,
    orderIds: target.orders.map((order) => order._id),
    checkoutGroupId: target.checkoutGroupId || null,
    publicOrderId: target.publicOrderRef,
    customer: primaryOrder.customer,
    gatewayName: PAYMENT_GATEWAY.PHONEPE,
    gatewayOrderId: merchantOrderId,
    amount: amountPaise,
    currency,
    status: PAYMENT_STATUS.PENDING,
    attemptCount,
    idempotencyKey: idempotencyKey || undefined,
    correlationId,
    rawGatewayResponse: {
      redirectUrl: response.redirectUrl,
      merchantOrderId: merchantOrderId,
      amount: amountPaise,
    },
    statusHistory: [
      {
        fromStatus: PAYMENT_STATUS.CREATED,
        toStatus: PAYMENT_STATUS.PENDING,
        source: PAYMENT_EVENT_SOURCE.SYSTEM,
        reason: "PhonePe checkout initiated",
      },
    ],
  };

  const payment = await Payment.create(paymentData);

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
      redirectUrl: response.redirectUrl,
    }),
  );

  return { payment, redirectUrl: response.redirectUrl, duplicate: false };
}

export async function verifyPhonePePaymentStatus({
  merchantOrderId,
  userId,
  correlationId = null,
}) {
  const payment = await Payment.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    const err = new Error("Payment attempt not found");
    err.statusCode = 404;
    throw err;
  }

  // Security check: only the owner or admin can verify
  if (userId && String(payment.customer) !== String(userId)) {
      const err = new Error("Not authorized to verify this payment");
      err.statusCode = 403;
      throw err;
  }

  const client = getPhonePeClient();
  const response = await client.getOrderStatus(merchantOrderId);
  const nextStatus = mapPhonePeStatusToInternal(response.state);

  await transitionPaymentState(payment, {
    nextStatus,
    source: PAYMENT_EVENT_SOURCE.CLIENT_VERIFY,
    reason: `PhonePe status check: ${response.state}`,
    gatewayPaymentId: response.transactionId,
    rawGatewayResponse: response,
  });

  await handleOrderSideEffectsFromPaymentStatus(
    payment,
    nextStatus,
    response.responseCode || response.state,
  );

  payment.correlationId = correlationId || payment.correlationId;
  await payment.save();

  console.log(
    JSON.stringify({
      level: "info",
      ts: new Date().toISOString(),
      event: "payment_status_verified",
      correlationId,
      merchantOrderId,
      status: nextStatus,
    }),
  );

  return {
    payment,
    status: nextStatus,
  };
}

export async function processPhonePeWebhook({
  rawBody,
  authorization,
  correlationId = null,
}) {
  const client = getPhonePeClient();
  let jsonPayload;
  try {
    jsonPayload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    const err = new Error("Invalid format: Webhook body must be JSON");
    err.statusCode = 400;
    throw err;
  }

  const base64Response = jsonPayload.response;
  if (!base64Response) {
    const err = new Error("Invalid payload: Missing 'response' field");
    err.statusCode = 400;
    throw err;
  }

  const isValid = await client.validateCallback(base64Response, authorization);
  if (!isValid) {
      const err = new Error("Invalid webhook signature");
      err.statusCode = 401;
      throw err;
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(base64Response, 'base64').toString('utf8'));
  } catch {
    const err = new Error("Invalid webhook payload: Base64 decode failed");
    err.statusCode = 400;
    throw err;
  }

  const eventId = payload.transactionId || crypto.randomUUID();
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
  const eventType = payload.state || "unknown";

  try {
    await PaymentWebhookEvent.create({
      eventId,
      gatewayName: PAYMENT_GATEWAY.PHONEPE,
      eventType,
      payloadHash,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return { duplicate: true, accepted: true };
    }
    throw error;
  }

  const merchantOrderId = payload.merchantOrderId;
  const payment = await Payment.findOne({ gatewayOrderId: merchantOrderId });
  if (!payment) {
    return { accepted: true, ignored: true, reason: "Payment attempt not found" };
  }

  const nextStatus = mapPhonePeStatusToInternal(payload.state);
  await transitionPaymentState(payment, {
    nextStatus,
    source: PAYMENT_EVENT_SOURCE.WEBHOOK,
    reason: `PhonePe webhook: ${payload.state}`,
    gatewayPaymentId: payload.transactionId,
    rawGatewayResponse: payload,
  });

  payment.correlationId = correlationId || payment.correlationId;
  await payment.save();

  await PaymentWebhookEvent.updateOne(
    { eventId },
    {
      $set: {
        payment: payment._id,
        publicOrderId: payment.publicOrderId,
      },
    },
  );

  await handleOrderSideEffectsFromPaymentStatus(payment, nextStatus, payload.responseCode || payload.state);

  return {
    accepted: true,
    duplicate: false,
    paymentStatus: nextStatus,
    publicOrderId: payment.publicOrderId,
  };
}

// Placeholder for Razorpay compatibility if needed by other services
export async function verifyClientPaymentCallback(data) {
    return verifyPhonePePaymentStatus({
        merchantOrderId: data.gatewayOrderId || data.merchantOrderId,
        userId: data.userId,
        correlationId: data.correlationId
    });
}
