import mongoose from "mongoose";
import Cart from "../models/cart.js";
import CheckoutGroup from "../models/checkoutGroup.js";
import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import { WORKFLOW_STATUS, DEFAULT_SELLER_TIMEOUT_MS } from "../constants/orderWorkflow.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import { freezeFinancialSnapshot } from "./finance/orderFinanceService.js";
import {
  generateUniqueCheckoutGroupId,
  generateUniquePublicOrderId,
} from "./orderIdService.js";
import { afterPlaceOrderV2 } from "./orderWorkflowService.js";
import {
  computeStockReservationWindow,
  reserveStockForItems,
} from "./stockService.js";
import {
  checkIdempotency,
  acquireIdempotencyLock,
  storeIdempotencyResult,
  storeIdempotencyError,
  releaseIdempotencyLock,
  isRetryableError,
  validateIdempotencyKey,
} from "./idempotencyService.js";
import { buildCheckoutPricingSnapshot } from "./checkoutPricingService.js";
import * as logger from "./logger.js";

const IDEMPOTENCY_RECORD_TTL_MS = 24 * 60 * 60 * 1000;

function normalizePaymentMode(raw) {
  const mode = String(raw || "COD").trim().toUpperCase();
  return mode === "ONLINE" ? "ONLINE" : "COD";
}

function normalizeAddress(address = {}) {
  const normalized = { ...(address || {}) };
  if (address?.location) {
    const lat = Number(address.location.lat);
    const lng = Number(address.location.lng);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      delete normalized.location;
    } else {
      normalized.location = { lat, lng };
    }
  }
  return normalized;
}

function mapOrderItemsForPersistence(hydratedItems = []) {
  return hydratedItems.map((item) => ({
    product: item.productId,
    name: item.productName,
    quantity: item.quantity,
    price: item.price,
    image: item.image || "",
  }));
}

function placementSource(payload = {}) {
  return Array.isArray(payload.items) && payload.items.length > 0
    ? "DIRECT_ITEMS"
    : "CART";
}

function toPlain(doc) {
  if (!doc) return doc;
  if (typeof doc.toObject === "function") return doc.toObject();
  return doc;
}

function buildResultPayload({ checkoutGroup, orders }) {
  const plainGroup = toPlain(checkoutGroup);
  const plainOrders = Array.isArray(orders) ? orders.map((item) => toPlain(item)) : [];
  return {
    checkoutGroup: plainGroup,
    orders: plainOrders,
    order: plainOrders[0] || null,
  };
}

async function findExistingCheckoutByIdempotency(customerId, idempotencyKey) {
  if (!idempotencyKey) return null;

  const checkoutGroup = await CheckoutGroup.findOne({
    customer: customerId,
    "placement.idempotencyKey": idempotencyKey,
  }).lean();
  if (checkoutGroup) {
    const orders = await Order.find({
      checkoutGroupId: checkoutGroup.checkoutGroupId,
    })
      .sort({ checkoutGroupIndex: 1, createdAt: 1 })
      .lean();
    return { checkoutGroup, orders };
  }

  const legacyOrder = await Order.findOne({
    customer: customerId,
    "placement.idempotencyKey": idempotencyKey,
  }).lean();
  if (!legacyOrder) return null;
  return {
    checkoutGroup: null,
    orders: [legacyOrder],
  };
}

async function resolveOrderItemsInput({
  payload,
  customerId,
  session,
}) {
  let orderItemsInput = Array.isArray(payload.items) ? payload.items.filter(Boolean) : [];
  if (orderItemsInput.length > 0) {
    return {
      orderItemsInput,
      source: "DIRECT_ITEMS",
      cartDocument: null,
    };
  }

  const cart = await Cart.findOne({ customerId }, null, { session });
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    const err = new Error("Cannot place order with empty cart");
    err.statusCode = 400;
    throw err;
  }

  orderItemsInput = cart.items.map((item) => ({
    product: item.productId,
    quantity: item.quantity,
  }));
  return {
    orderItemsInput,
    source: "CART",
    cartDocument: cart,
  };
}

async function consumeCartItems({
  customerId,
  source,
  orderItemsInput,
  session,
  cartDocument = null,
}) {
  if (source === "CART") {
    const cart = cartDocument || (await Cart.findOne({ customerId }, null, { session }));
    if (!cart) return;
    cart.items = [];
    await cart.save({ session });
    return;
  }

  const cart = cartDocument || (await Cart.findOne({ customerId }, null, { session }));
  if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
    return;
  }

  const requestedQtyByProduct = new Map();
  for (const item of orderItemsInput || []) {
    const productId = String(item.product || item.productId || "");
    if (!productId) continue;
    const quantity = Math.max(Number(item.quantity || 0), 0);
    if (!quantity) continue;
    requestedQtyByProduct.set(
      productId,
      (requestedQtyByProduct.get(productId) || 0) + quantity,
    );
  }

  const remaining = [];
  for (const cartItem of cart.items) {
    const productId = String(cartItem.productId);
    const requested = requestedQtyByProduct.get(productId) || 0;
    if (requested <= 0) {
      remaining.push(cartItem);
      continue;
    }
    const quantityLeft = Number(cartItem.quantity || 0) - requested;
    if (quantityLeft > 0) {
      remaining.push({
        productId: cartItem.productId,
        quantity: quantityLeft,
      });
    }
    requestedQtyByProduct.delete(productId);
  }

  cart.items = remaining;
  await cart.save({ session });
}

function buildCheckoutGroupStatus(paymentMode) {
  return paymentMode === "ONLINE" ? "PAYMENT_PENDING" : "CREATED";
}

function buildCheckoutGroupPaymentStatus(paymentMode) {
  return paymentMode === "ONLINE"
    ? ORDER_PAYMENT_STATUS.CREATED
    : ORDER_PAYMENT_STATUS.PENDING_CASH_COLLECTION;
}

export async function placeOrderAtomic({
  customerId,
  payload,
  idempotencyKey = null,
  retryCount = 0,
}) {
  const normalizedPayload = {
    ...(payload || {}),
    paymentMode: normalizePaymentMode(payload?.paymentMode),
  };

  if (idempotencyKey) {
    if (!validateIdempotencyKey(idempotencyKey)) {
      const error = new Error("Invalid idempotency key format");
      error.statusCode = 400;
      throw error;
    }

    const idempotencyCheck = await checkIdempotency(idempotencyKey, normalizedPayload);
    if (idempotencyCheck.exists && !idempotencyCheck.checksumMismatch) {
      if (idempotencyCheck.result.status === "error") {
        const error = new Error(idempotencyCheck.result.error.message);
        error.statusCode = idempotencyCheck.result.error.statusCode || 500;
        throw error;
      }
      return {
        ...idempotencyCheck.result.data,
        duplicate: true,
      };
    }
    if (idempotencyCheck.checksumMismatch) {
      const error = new Error("Idempotency key reused with different payload");
      error.statusCode = 422;
      throw error;
    }
    if (idempotencyCheck.inProgress) {
      const error = new Error("Request is being processed");
      error.statusCode = 409;
      throw error;
    }

    const lockAcquired = await acquireIdempotencyLock(idempotencyKey);
    if (!lockAcquired) {
      const error = new Error("Request is being processed");
      error.statusCode = 409;
      throw error;
    }
  }

  const existingByIdempotency = await findExistingCheckoutByIdempotency(customerId, idempotencyKey);
  if (existingByIdempotency) {
    const existingResult = buildResultPayload({
      checkoutGroup: existingByIdempotency.checkoutGroup,
      orders: existingByIdempotency.orders,
    });
    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, existingResult, normalizedPayload);
    }
    return { ...existingResult, duplicate: true };
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: parseInt(process.env.CHECKOUT_TRANSACTION_TIMEOUT_MS || "20000", 10),
    });

    const paymentMode = normalizePaymentMode(normalizedPayload.paymentMode);
    const normalizedAddress = normalizeAddress(normalizedPayload.address);
    const idempotencyKeyExpiry = idempotencyKey
      ? new Date(Date.now() + IDEMPOTENCY_RECORD_TTL_MS)
      : null;
    const source = placementSource(normalizedPayload);

    const {
      orderItemsInput,
      source: resolvedSource,
      cartDocument,
    } = await resolveOrderItemsInput({
      payload: normalizedPayload,
      customerId,
      session,
    });

    const pricingSnapshot = await buildCheckoutPricingSnapshot({
      orderItems: orderItemsInput,
      address: normalizedAddress,
      session,
    });

    const checkoutGroupId = await generateUniqueCheckoutGroupId({ session });
    const checkoutReservation = computeStockReservationWindow(paymentMode);
    const checkoutGroup = new CheckoutGroup({
      checkoutGroupId,
      customer: customerId,
      paymentMode,
      paymentStatus: buildCheckoutGroupPaymentStatus(paymentMode),
      status: buildCheckoutGroupStatus(paymentMode),
      stockReservation: checkoutReservation,
      pricingSummary: pricingSnapshot.aggregateBreakdown,
      sellerCount: pricingSnapshot.sellerCount,
      itemCount: pricingSnapshot.itemCount,
      addressSnapshot: normalizedAddress,
      placement: {
        idempotencyKey: idempotencyKey || undefined,
        idempotencyKeyExpiry,
        createdFrom: resolvedSource || source,
      },
      expiresAt: checkoutReservation.expiresAt || null,
      metadata: {
        timeSlot: normalizedPayload.timeSlot || "now",
      },
    });
    await checkoutGroup.save({ session });

    const orders = [];
    const sellerTimeoutMs = DEFAULT_SELLER_TIMEOUT_MS();
    const shouldStartSellerWorkflow = paymentMode === "COD";

    for (let index = 0; index < pricingSnapshot.sellerBreakdownEntries.length; index += 1) {
      const entry = pricingSnapshot.sellerBreakdownEntries[index];
      const orderId = await generateUniquePublicOrderId({ session });
      const orderReservation = computeStockReservationWindow(paymentMode);
      const sellerPendingUntil = shouldStartSellerWorkflow
        ? new Date(Date.now() + sellerTimeoutMs)
        : null;
      const orderExpiresAt = orderReservation.expiresAt || sellerPendingUntil || null;

      await reserveStockForItems({
        items: entry.items,
        sellerId: entry.sellerId,
        orderId,
        session,
        paymentMode,
      });

      const order = new Order({
        orderId,
        customer: customerId,
        seller: entry.sellerId,
        items: mapOrderItemsForPersistence(entry.items),
        address: normalizedAddress,
        paymentMode,
        paymentStatus:
          paymentMode === "ONLINE"
            ? ORDER_PAYMENT_STATUS.CREATED
            : ORDER_PAYMENT_STATUS.PENDING_CASH_COLLECTION,
        payment: {
          method: paymentMode === "ONLINE" ? "online" : "cash",
          status: "pending",
        },
        status: "pending",
        orderStatus: "pending",
        timeSlot: normalizedPayload.timeSlot || "now",
        workflowVersion: 2,
        workflowStatus: shouldStartSellerWorkflow
          ? WORKFLOW_STATUS.SELLER_PENDING
          : WORKFLOW_STATUS.CREATED,
        sellerPendingExpiresAt: sellerPendingUntil,
        expiresAt: orderExpiresAt,
        stockReservation: orderReservation,
        checkoutGroupId,
        checkoutGroupSize: pricingSnapshot.sellerCount,
        checkoutGroupIndex: index,
        placement: {
          idempotencyKey: idempotencyKey || undefined,
          idempotencyKeyExpiry,
          createdFrom: resolvedSource || source,
        },
        settlementStatus: {
          overall: "PENDING",
          sellerPayout: "PENDING",
          riderPayout: "PENDING",
          adminEarningCredited: false,
        },
      });

      freezeFinancialSnapshot(order, entry.breakdown);
      await order.save({ session });
      orders.push(order);
    }

    checkoutGroup.orderIds = orders.map((order) => order._id);
    checkoutGroup.publicOrderIds = orders.map((order) => order.orderId);
    checkoutGroup.sellerBreakdown = orders.map((order, index) => ({
      seller: order.seller,
      order: order._id,
      publicOrderId: order.orderId,
      itemCount: order.items.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      subtotal: Number(order.paymentBreakdown?.productSubtotal || 0),
      sellerPayout: Number(order.paymentBreakdown?.sellerPayoutTotal || 0),
      adminCommission: Number(order.paymentBreakdown?.adminProductCommissionTotal || 0),
      grandTotal: Number(order.paymentBreakdown?.grandTotal || 0),
    }));
    await checkoutGroup.save({ session });

    const transactionRows = orders.map((order) => ({
      user: order.seller,
      userModel: "Seller",
      order: order._id,
      type: "Order Payment",
      amount: Number(order.paymentBreakdown?.grandTotal || order.pricing?.total || 0),
      status: "Pending",
      reference: order.orderId,
      meta: {
        checkoutGroupId,
      },
    }));
    if (transactionRows.length > 0) {
      await Transaction.create(transactionRows, { session });
    }

    await consumeCartItems({
      customerId,
      source: resolvedSource || source,
      orderItemsInput,
      session,
      cartDocument,
    });

    await session.commitTransaction();

    const resultPayload = buildResultPayload({
      checkoutGroup,
      orders,
    });

    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, resultPayload, normalizedPayload);
    }

    if (shouldStartSellerWorkflow) {
      for (const order of orders) {
        void afterPlaceOrderV2(order).catch((error) => {
          logger.warn("[placeOrderAtomic] afterPlaceOrderV2 failed", {
            orderId: order.orderId,
            message: error.message,
          });
        });
      }
    }

    return { ...resultPayload, duplicate: false };
  } catch (error) {
    await session.abortTransaction();

    if (idempotencyKey) {
      if (isRetryableError(error)) {
        await releaseIdempotencyLock(idempotencyKey);
      } else {
        await storeIdempotencyError(idempotencyKey, error, normalizedPayload);
      }
    }

    if (error?.code === 11000) {
      if (idempotencyKey) {
        const existing = await findExistingCheckoutByIdempotency(customerId, idempotencyKey);
        if (existing) {
          const existingResult = buildResultPayload({
            checkoutGroup: existing.checkoutGroup,
            orders: existing.orders,
          });
          await storeIdempotencyResult(idempotencyKey, existingResult, normalizedPayload);
          return { ...existingResult, duplicate: true };
        }
      }

      if (retryCount < 2 && /orderId|checkoutGroupId/i.test(String(error.message || ""))) {
        return placeOrderAtomic({
          customerId,
          payload: normalizedPayload,
          idempotencyKey,
          retryCount: retryCount + 1,
        });
      }
    }

    throw error;
  } finally {
    session.endSession();
  }
}

export default {
  placeOrderAtomic,
};
