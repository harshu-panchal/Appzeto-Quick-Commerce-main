import mongoose from "mongoose";
import Cart from "../models/cart.js";
import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import { WORKFLOW_STATUS, DEFAULT_SELLER_TIMEOUT_MS } from "../constants/orderWorkflow.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import {
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "./finance/pricingService.js";
import { freezeFinancialSnapshot } from "./finance/orderFinanceService.js";
import { generateUniquePublicOrderId } from "./orderIdService.js";
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
import { processMultiSellerCheckout } from "./multiSellerCheckoutService.js";
import * as logger from "./logger.js";

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

function buildDuplicateOrderQuery(customerId, idempotencyKey) {
  if (!idempotencyKey) return null;
  return {
    customer: customerId,
    "placement.idempotencyKey": idempotencyKey,
  };
}

export async function placeOrderAtomic({
  customerId,
  payload,
  idempotencyKey = null,
  retryCount = 0,
}) {
  // Phase 2: Idempotency check
  if (idempotencyKey) {
    if (!validateIdempotencyKey(idempotencyKey)) {
      const error = new Error("Invalid idempotency key format");
      error.statusCode = 400;
      throw error;
    }
    
    try {
      const idempotencyCheck = await checkIdempotency(idempotencyKey, payload);
      
      // Return cached result if exists
      if (idempotencyCheck.exists && !idempotencyCheck.checksumMismatch) {
        logger.info(`[OrderPlacement] Returning cached result for idempotency key: ${idempotencyKey}`);
        
        if (idempotencyCheck.result.status === "error") {
          const error = new Error(idempotencyCheck.result.error.message);
          error.statusCode = idempotencyCheck.result.error.statusCode || 500;
          throw error;
        }
        
        return { order: idempotencyCheck.result.data, duplicate: true };
      }
      
      // Checksum mismatch - same key with different payload
      if (idempotencyCheck.checksumMismatch) {
        const error = new Error("Idempotency key reused with different payload");
        error.statusCode = 422;
        throw error;
      }
      
      // Request in progress
      if (idempotencyCheck.inProgress) {
        const error = new Error("Request is being processed");
        error.statusCode = 409;
        throw error;
      }
      
      // Acquire lock for new request
      const lockAcquired = await acquireIdempotencyLock(idempotencyKey);
      
      if (!lockAcquired) {
        const error = new Error("Request is being processed");
        error.statusCode = 409;
        throw error;
      }
      
      logger.info(`[OrderPlacement] Idempotency lock acquired for key: ${idempotencyKey}`);
      
    } catch (error) {
      // If it's an idempotency-related error, throw it immediately
      if (error.statusCode === 409 || error.statusCode === 422 || error.statusCode === 400) {
        throw error;
      }
      // Otherwise, log and continue without idempotency
      logger.error(`[OrderPlacement] Idempotency check failed, continuing without idempotency:`, error);
    }
  }
  
  // Check for duplicate order (legacy fallback)
  const duplicateQuery = buildDuplicateOrderQuery(customerId, idempotencyKey);
  if (duplicateQuery) {
    const existing = await Order.findOne(duplicateQuery).lean();
    if (existing) {
      if (idempotencyKey) {
        await storeIdempotencyResult(idempotencyKey, existing, payload);
      }
      return { order: existing, duplicate: true };
    }
  }

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    let orderItemsInput = Array.isArray(payload.items) ? payload.items.filter(Boolean) : [];
    if (orderItemsInput.length === 0) {
      const cart = await Cart.findOne({ customerId }, null, { session }).lean();
      if (!cart || !Array.isArray(cart.items) || cart.items.length === 0) {
        const err = new Error("Cannot place order with empty cart");
        err.statusCode = 400;
        throw err;
      }
      orderItemsInput = cart.items.map((item) => ({
        product: item.productId,
        quantity: item.quantity,
      }));
    }

    const hydratedItems = await hydrateOrderItems(orderItemsInput, {
      session,
      enforceServerPricing: true,
    });
    
    // Phase 2: Check for multi-seller checkout
    const sellerIds = new Set(hydratedItems.map(item => item.sellerId?.toString()));
    const isMultiSeller = sellerIds.size > 1;
    
    if (isMultiSeller) {
      logger.info(`[OrderPlacement] Multi-seller checkout detected (${sellerIds.size} sellers)`);
      
      // Use multi-seller checkout service
      const multiSellerResult = await processMultiSellerCheckout({
        customerId,
        items: orderItemsInput,
        address: payload.address,
        payment: { method: normalizePaymentMode(payload.paymentMode) },
        pricing: {
          deliveryFee: 0, // Will be calculated per seller
          platformFee: 0,
          total: 0, // Will be calculated
        },
        timeSlot: payload.timeSlot,
        idempotencyKey,
      });
      
      await session.commitTransaction();
      
      // Store idempotency result
      if (idempotencyKey) {
        await storeIdempotencyResult(idempotencyKey, multiSellerResult, payload);
      }
      
      return { order: multiSellerResult.orders[0], orders: multiSellerResult.orders, duplicate: false };
    }
    
    // Single seller checkout (existing flow)
    const sellerId = hydratedItems[0]?.sellerId;
    const paymentMode = normalizePaymentMode(payload.paymentMode);

    const breakdown = await generateOrderPaymentBreakdown({
      items: orderItemsInput,
      preHydratedItems: hydratedItems,
      distanceKm: payload.distanceKm || 0,
      discountTotal: payload.discountTotal || 0,
      taxTotal: payload.taxTotal || 0,
      session,
    });

    const orderId = await generateUniquePublicOrderId({ session });
    const reservation = computeStockReservationWindow(paymentMode);
    const sellerPendingUntil = new Date(Date.now() + DEFAULT_SELLER_TIMEOUT_MS());
    const shouldStartSellerWorkflow = paymentMode === "COD";

    await reserveStockForItems({
      items: hydratedItems,
      sellerId,
      orderId,
      session,
      paymentMode,
    });

    // Phase 2: Set idempotency key expiry for TTL index
    const idempotencyKeyExpiry = idempotencyKey 
      ? new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
      : null;

    const order = new Order({
      orderId,
      customer: customerId,
      seller: sellerId,
      items: mapOrderItemsForPersistence(hydratedItems),
      address: normalizeAddress(payload.address),
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
      timeSlot: payload.timeSlot || "now",
      workflowVersion: 2,
      workflowStatus: shouldStartSellerWorkflow
        ? WORKFLOW_STATUS.SELLER_PENDING
        : WORKFLOW_STATUS.CREATED,
      sellerPendingExpiresAt: shouldStartSellerWorkflow ? sellerPendingUntil : null,
      expiresAt: reservation.expiresAt || sellerPendingUntil,
      stockReservation: reservation,
      placement: {
        idempotencyKey: idempotencyKey || undefined,
        idempotencyKeyExpiry,
        createdFrom: Array.isArray(payload.items) && payload.items.length > 0 ? "DIRECT_ITEMS" : "CART",
      },
      settlementStatus: {
        overall: "PENDING",
        sellerPayout: "PENDING",
        riderPayout: "PENDING",
        adminEarningCredited: false,
      },
    });

    freezeFinancialSnapshot(order, breakdown);
    await order.save({ session });

    await Transaction.create(
      [
        {
          user: sellerId,
          userModel: "Seller",
          order: order._id,
          type: "Order Payment",
          amount: breakdown.grandTotal,
          status: "Pending",
          reference: order.orderId,
        },
      ],
      { session },
    );

    await Cart.findOneAndUpdate(
      { customerId },
      { $set: { items: [] } },
      { session },
    );

    await session.commitTransaction();
    
    // Phase 2: Store idempotency result
    if (idempotencyKey) {
      await storeIdempotencyResult(idempotencyKey, order, payload);
    }

    if (shouldStartSellerWorkflow) {
      void afterPlaceOrderV2(order).catch((error) => {
        console.warn("[placeOrderAtomic] afterPlaceOrderV2:", error.message);
      });
    }

    return { order, duplicate: false };
  } catch (error) {
    await session.abortTransaction();
    
    // Phase 2: Handle idempotency on error
    if (idempotencyKey) {
      if (isRetryableError(error)) {
        // Release lock for retryable errors
        await releaseIdempotencyLock(idempotencyKey);
        logger.info(`[OrderPlacement] Released idempotency lock for retryable error: ${error.message}`);
      } else {
        // Cache error for non-retryable errors
        await storeIdempotencyError(idempotencyKey, error, payload);
        logger.info(`[OrderPlacement] Cached error for non-retryable error: ${error.message}`);
      }
    }

    if (error?.code === 11000) {
      if (idempotencyKey) {
        const existing = await Order.findOne({
          customer: customerId,
          "placement.idempotencyKey": idempotencyKey,
        }).lean();
        if (existing) {
          if (idempotencyKey) {
            await storeIdempotencyResult(idempotencyKey, existing, payload);
          }
          return { order: existing, duplicate: true };
        }
      }
      if (String(error.message || "").includes("orderId")) {
        if (retryCount >= 2) {
          throw error;
        }
        const retriedPayload = { ...(payload || {}) };
        return placeOrderAtomic({
          customerId,
          payload: retriedPayload,
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
