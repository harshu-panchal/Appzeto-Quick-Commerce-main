import crypto from "crypto";
import mongoose from "mongoose";
import Order from "../models/order.js";
import Cart from "../models/cart.js";
import Product from "../models/product.js";
import Seller from "../models/seller.js";
import StockHistory from "../models/stockHistory.js";
import handleResponse from "../utils/helper.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { WORKFLOW_STATUS, DEFAULT_SELLER_TIMEOUT_MS } from "../constants/orderWorkflow.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import {
  checkoutPreviewSchema,
  codMarkCollectedSchema,
  codReconcileSchema,
  createFinanceOrderSchema,
  deliveredSchema,
  verifyOnlinePaymentSchema,
} from "../validation/financeValidation.js";
import {
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "../services/finance/pricingService.js";
import {
  freezeFinancialSnapshot,
  handleCodOrderFinance,
  handleOnlineOrderFinance,
  reconcileCodCash,
  settleDeliveredOrder,
} from "../services/finance/orderFinanceService.js";
import { afterPlaceOrderV2 } from "../services/orderWorkflowService.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";

function validateWithJoi(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    const details = error.details.map((item) => item.message).join("; ");
    const err = new Error(details);
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function buildOrderId() {
  return `ORD${Date.now()}${Math.floor(Math.random() * 1000)}`;
}

async function deriveDistanceKm({ sellerId, addressLocation, distanceKmHint }) {
  if (typeof distanceKmHint === "number" && Number.isFinite(distanceKmHint)) {
    return Math.max(distanceKmHint, 0);
  }
  if (
    typeof addressLocation?.lat !== "number" ||
    typeof addressLocation?.lng !== "number" ||
    !sellerId
  ) {
    return 0;
  }

  const seller = await Seller.findById(sellerId).select("location").lean();
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) {
    return 0;
  }
  const [lng, lat] = coords;
  const meters = distanceMeters(
    Number(addressLocation.lat),
    Number(addressLocation.lng),
    Number(lat),
    Number(lng),
  );
  return Number((meters / 1000).toFixed(3));
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

function verifyRazorpaySignature(payload) {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature,
  } = payload || {};
  if (!orderId || !paymentId || !signature) return true;

  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) {
    throw new Error("Razorpay secret is not configured");
  }

  const body = `${orderId}|${paymentId}`;
  const expected = crypto.createHmac("sha256", secret).update(body).digest("hex");
  return expected === signature;
}

export const previewCheckoutFinance = async (req, res) => {
  try {
    const payload = validateWithJoi(checkoutPreviewSchema, req.body || {});
    const hydratedItems = await hydrateOrderItems(payload.items);
    const sellerId = hydratedItems[0]?.sellerId;
    const distanceKm = await deriveDistanceKm({
      sellerId,
      addressLocation: payload.address?.location,
      distanceKmHint: payload.distanceKm,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      items: payload.items,
      preHydratedItems: hydratedItems,
      distanceKm,
      discountTotal: payload.discountTotal,
      taxTotal: payload.taxTotal,
    });

    // Debug helper: when enabled, return the exact coordinates used for distance calc.
    // This makes it easy to detect wrong seller location or stale customer coords.
    let distanceDebug = undefined;
    if (String(process.env.FINANCE_DEBUG_DISTANCE || "").toLowerCase() === "true") {
      try {
        const seller = sellerId
          ? await Seller.findById(sellerId).select("shopName location").lean()
          : null;
        const coords = seller?.location?.coordinates;
        const sellerPoint =
          Array.isArray(coords) && coords.length >= 2
            ? { lat: Number(coords[1]), lng: Number(coords[0]) }
            : null;
        const customerPoint =
          payload.address?.location &&
          typeof payload.address.location.lat === "number" &&
          typeof payload.address.location.lng === "number"
            ? {
                lat: Number(payload.address.location.lat),
                lng: Number(payload.address.location.lng),
              }
            : null;
        distanceDebug = {
          sellerId: sellerId || null,
          sellerShopName: seller?.shopName || null,
          sellerPoint,
          customerPoint,
          distanceKmDerived: distanceKm,
        };
      } catch {
        // ignore debug failures
      }
    }

    return handleResponse(res, 200, "Checkout preview generated", {
      paymentMode: payload.paymentMode,
      breakdown,
      ...(distanceDebug ? { distanceDebug } : {}),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const createOrderWithFinancialSnapshot = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    const customerId = req.user?.id;
    const payload = validateWithJoi(createFinanceOrderSchema, req.body || {});

    session.startTransaction();

    const hydratedItems = await hydrateOrderItems(payload.items);
    const sellerId = hydratedItems[0]?.sellerId;
    const distanceKm = await deriveDistanceKm({
      sellerId,
      addressLocation: payload.address?.location,
      distanceKmHint: payload.distanceKm,
    });

    const breakdown = await generateOrderPaymentBreakdown({
      items: payload.items,
      preHydratedItems: hydratedItems,
      distanceKm,
      discountTotal: payload.discountTotal,
      taxTotal: payload.taxTotal,
    });

    const orderId = buildOrderId();
    const pendingUntil = new Date(Date.now() + DEFAULT_SELLER_TIMEOUT_MS());
    const paymentMode = payload.paymentMode || "COD";

    const order = new Order({
      orderId,
      customer: customerId,
      seller: sellerId,
      items: mapOrderItemsForPersistence(hydratedItems),
      address: payload.address,
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
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: pendingUntil,
      expiresAt: pendingUntil,
      settlementStatus: {
        overall: "PENDING",
        sellerPayout: "PENDING",
        riderPayout: "PENDING",
        adminEarningCredited: false,
      },
      distanceSnapshot: {
        distanceKmActual: breakdown.distanceKmActual,
        distanceKmRounded: breakdown.distanceKmRounded,
      },
      pricingSnapshot: {
        deliverySettings: breakdown.snapshots?.deliverySettings || {},
        categoryCommissionSettings:
          breakdown.snapshots?.categoryCommissionSettings || [],
        handlingFeeStrategy: breakdown.snapshots?.handlingFeeStrategy || null,
        handlingCategoryUsed: breakdown.snapshots?.handlingCategoryUsed || {},
      },
    });

    // Reserve stock at order creation so finance-enabled checkout stays consistent
    // with legacy order placement behavior.
    for (const item of hydratedItems) {
      const updated = await Product.findOneAndUpdate(
        {
          _id: item.productId,
          stock: { $gte: item.quantity },
        },
        { $inc: { stock: -item.quantity } },
        { new: true, session },
      );

      if (!updated) {
        throw new Error(`Insufficient stock for product: ${item.productName}`);
      }

      await StockHistory.create(
        [
          {
            product: item.productId,
            seller: sellerId,
            type: "Sale",
            quantity: -item.quantity,
            note: `Order #${orderId}`,
            order: order._id,
          },
        ],
        { session },
      );
    }

    freezeFinancialSnapshot(order, breakdown);
    await order.save({ session });
    await Cart.findOneAndUpdate(
      { customerId },
      { items: [] },
      { session },
    );

    await session.commitTransaction();

    void afterPlaceOrderV2(order).catch((error) => {
      console.warn("[createOrderWithFinancialSnapshot] afterPlaceOrderV2:", error.message);
    });

    return handleResponse(res, 201, "Order created with financial snapshot", order);
  } catch (error) {
    await session.abortTransaction();
    return handleResponse(res, error.statusCode || 500, error.message);
  } finally {
    session.endSession();
  }
};

export const verifyOnlineOrderPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = validateWithJoi(verifyOnlinePaymentSchema, req.body || {});
    const orderKey = orderMatchQueryFromRouteParam(id);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }
    const order = await Order.findOne(orderKey).select("_id orderId paymentMode").lean();
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const validSignature = verifyRazorpaySignature(payload);
    if (!validSignature) {
      return handleResponse(res, 400, "Online payment verification failed");
    }

    const transactionId =
      payload.transactionId || payload.razorpay_payment_id || "";
    const updated = await handleOnlineOrderFinance(order._id, {
      actorId: req.user?.id || null,
      transactionId,
      metadata: payload.paymentMeta || {},
    });

    return handleResponse(res, 200, "Online payment verified and applied", updated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const markCodCollectedAfterDelivery = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = validateWithJoi(codMarkCollectedSchema, req.body || {});
    const orderKey = orderMatchQueryFromRouteParam(id);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }
    const order = await Order.findOne(orderKey)
      .select("_id deliveryBoy seller status orderStatus paymentMode financeFlags")
      .lean();
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (order.paymentMode === "ONLINE") {
      return handleResponse(res, 400, "COD collection is only allowed for COD orders");
    }

    const isDelivered =
      order.status === "delivered" || order.orderStatus === "delivered";
    if (!isDelivered) {
      return handleResponse(res, 400, "COD collection is allowed only after delivery");
    }

    if (
      req.user?.role === "delivery" &&
      order.deliveryBoy &&
      String(order.deliveryBoy) !== String(req.user.id)
    ) {
      return handleResponse(res, 403, "Only assigned delivery partner can mark COD collection");
    }

    const deliveryPartnerId =
      payload.deliveryPartnerId ||
      order.deliveryBoy ||
      (req.user?.role === "delivery" ? req.user.id : null);

    if (order.financeFlags?.codMarkedCollected) {
      return handleResponse(res, 200, "COD amount already marked as collected", order);
    }

    const updated = await handleCodOrderFinance(order._id, {
      amount: payload.amount,
      deliveryPartnerId,
      actorId: req.user?.id || null,
    });

    return handleResponse(res, 200, "COD amount marked as collected", updated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const markOrderDeliveredAndSettle = async (req, res) => {
  try {
    const { id } = req.params;
    validateWithJoi(deliveredSchema, req.body || {});
    const orderKey = orderMatchQueryFromRouteParam(id);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }
    const order = await Order.findOne(orderKey).select("_id deliveryBoy seller").lean();
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (
      req.user?.role === "delivery" &&
      order.deliveryBoy &&
      String(order.deliveryBoy) !== String(req.user.id)
    ) {
      return handleResponse(res, 403, "Only assigned delivery partner can mark this order delivered");
    }
    if (
      req.user?.role === "seller" &&
      order.seller &&
      String(order.seller) !== String(req.user.id)
    ) {
      return handleResponse(res, 403, "Only order seller can mark this order delivered");
    }

    const updated = await settleDeliveredOrder(order._id, {
      actorId: req.user?.id || null,
    });

    // For COD orders, "delivery" implies cash is collected by the assigned delivery partner.
    // This updates System Float (COD) as: grandTotal - riderPayoutTotal.
    if (
      updated?.paymentMode === "COD" &&
      updated?.deliveryBoy &&
      !updated?.financeFlags?.codMarkedCollected
    ) {
      const deliveryPartnerId = updated.deliveryBoy;
      const updatedWithCod = await handleCodOrderFinance(updated._id, {
        deliveryPartnerId,
        actorId: req.user?.id || null,
      });
      return handleResponse(res, 200, "Order delivered and COD cash collected", updatedWithCod);
    }

    return handleResponse(res, 200, "Order delivered and settlement queued", updated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const reconcileCodCashSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = validateWithJoi(codReconcileSchema, req.body || {});
    const orderKey = orderMatchQueryFromRouteParam(id);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }
    const order = await Order.findOne(orderKey).select("_id deliveryBoy").lean();
    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (
      req.user?.role === "delivery" &&
      order.deliveryBoy &&
      String(order.deliveryBoy) !== String(req.user.id)
    ) {
      return handleResponse(res, 403, "Only assigned delivery partner can reconcile COD cash");
    }

    const deliveryPartnerId =
      payload.deliveryPartnerId ||
      order.deliveryBoy ||
      (req.user?.role === "delivery" ? req.user.id : null);

    const updated = await reconcileCodCash(
      order._id,
      payload.amount,
      deliveryPartnerId,
      {
        actorId: req.user?.id || null,
        metadata: payload.metadata || {},
      },
    );

    return handleResponse(res, 200, "COD cash reconciled successfully", updated);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
