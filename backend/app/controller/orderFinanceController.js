import Order from "../models/order.js";
import Seller from "../models/seller.js";
import handleResponse from "../utils/helper.js";
import { distanceMeters } from "../utils/geoUtils.js";
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
  handleCodOrderFinance,
  reconcileCodCash,
  settleDeliveredOrder,
} from "../services/finance/orderFinanceService.js";
import { placeOrderAtomic } from "../services/orderPlacementService.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import { verifyClientPaymentCallback } from "../services/paymentService.js";

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
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const payload = validateWithJoi(createFinanceOrderSchema, req.body || {});
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim() || null;

    const { order, duplicate } = await placeOrderAtomic({
      customerId,
      payload,
      idempotencyKey,
    });

    return handleResponse(
      res,
      duplicate ? 200 : 201,
      duplicate
        ? "Duplicate request resolved using existing order"
        : "Order created with financial snapshot",
      order,
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const verifyOnlineOrderPayment = async (req, res) => {
  try {
    const { id } = req.params;
    const payload = validateWithJoi(verifyOnlinePaymentSchema, req.body || {});
    const verification = await verifyClientPaymentCallback({
      orderRef: id,
      userId: req.user?.id,
      gatewayOrderId: payload.razorpay_order_id,
      gatewayPaymentId: payload.razorpay_payment_id,
      gatewaySignature: payload.razorpay_signature,
      correlationId: req.correlationId || null,
    });

    return handleResponse(res, 200, "Online payment verification processed", {
      paymentStatus: verification.status,
      publicOrderId: verification.payment.publicOrderId,
      gatewayOrderId: verification.payment.gatewayOrderId,
      gatewayPaymentId: verification.payment.gatewayPaymentId,
    });
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
