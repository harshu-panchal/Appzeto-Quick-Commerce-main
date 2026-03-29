import Order from "../models/order.js";
import Cart from "../models/cart.js";
import Product from "../models/product.js";
import Transaction from "../models/transaction.js";
import StockHistory from "../models/stockHistory.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import Setting from "../models/setting.js";
import User from "../models/customer.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { WORKFLOW_STATUS, DEFAULT_SELLER_TIMEOUT_MS } from "../constants/orderWorkflow.js";
import { ORDER_PAYMENT_STATUS } from "../constants/finance.js";
import {
  afterPlaceOrderV2,
  sellerAcceptAtomic,
  sellerRejectAtomic,
  deliveryAcceptAtomic,
  customerCancelV2,
  resolveWorkflowStatus,
} from "../services/orderWorkflowService.js";
import { applyDeliveredSettlement } from "../services/orderSettlement.js";
import {
  freezeFinancialSnapshot,
  reverseOrderFinanceOnCancellation,
} from "../services/finance/orderFinanceService.js";
import {
  generateOrderPaymentBreakdown,
  hydrateOrderItems,
} from "../services/finance/pricingService.js";
import { distanceMeters } from "../utils/geoUtils.js";
import {
  fetchAvailableOrdersForDelivery,
  fetchSellerOrdersPage,
} from "../services/orderQueryService.js";
import {
  orderMatchQueryFromRouteParam,
  orderMatchQueryFlexible,
} from "../utils/orderLookup.js";
import { createFinanceOrderSchema } from "../validation/financeValidation.js";
import { placeOrderAtomic } from "../services/orderPlacementService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

function validateWithJoi(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (error) {
    const err = new Error(error.details.map((item) => item.message).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}

function normalizePaymentMode(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return null;
  if (raw === "ONLINE") return "ONLINE";
  if (raw === "COD" || raw === "CASH") return "COD";
  return null;
}

function inferPaymentMode(payment = {}) {
  const candidates = [
    payment.paymentMode,
    payment.mode,
    payment.method,
    payment.type,
    payment.paymentMethod,
  ]
    .filter(Boolean)
    .map((value) => String(value).trim().toLowerCase());

  if (
    candidates.some(
      (value) =>
        value.includes("online") || value.includes("upi") || value.includes("card"),
    )
  ) {
    return "ONLINE";
  }
  if (candidates.some((value) => value.includes("cod") || value.includes("cash"))) {
    return "COD";
  }
  return null;
}

async function deriveDistanceKm({ sellerId, addressLocation }) {
  if (
    typeof addressLocation?.lat !== "number" ||
    typeof addressLocation?.lng !== "number" ||
    !Number.isFinite(addressLocation.lat) ||
    !Number.isFinite(addressLocation.lng) ||
    !sellerId
  ) {
    return 0;
  }

  const seller = await Seller.findById(sellerId).select("location").lean();
  const coords = seller?.location?.coordinates;
  if (!Array.isArray(coords) || coords.length < 2) return 0;
  const [lng, lat] = coords;
  const meters = distanceMeters(
    Number(addressLocation.lat),
    Number(addressLocation.lng),
    Number(lat),
    Number(lng),
  );
  return Number((meters / 1000).toFixed(3));
}

function buildFallbackBreakdownFromPricing(pricing = {}) {
  const subtotal = Number(pricing.subtotal || 0);
  const deliveryFee = Number(pricing.deliveryFee || 0);
  const handlingFee = Number(pricing.platformFee || 0);
  const taxTotal = Number(pricing.gst || 0);
  const discountTotal = Number(pricing.discount || 0);
  const grandTotal = Number(pricing.total || 0);

  return {
    productSubtotal: Number.isFinite(subtotal) ? subtotal : 0,
    deliveryFeeCharged: Number.isFinite(deliveryFee) ? deliveryFee : 0,
    handlingFeeCharged: Number.isFinite(handlingFee) ? handlingFee : 0,
    discountTotal: Number.isFinite(discountTotal) ? discountTotal : 0,
    taxTotal: Number.isFinite(taxTotal) ? taxTotal : 0,
    grandTotal: Number.isFinite(grandTotal) ? grandTotal : 0,
    snapshots: {
      deliverySettings: {},
      categoryCommissionSettings: [],
      handlingFeeStrategy: null,
      handlingCategoryUsed: {},
    },
    lineItems: [],
  };
}

/* ===============================
   PLACE ORDER
================================ */
export const placeOrder = async (req, res) => {
  try {
    const customerId = req.user?.id;
    if (!customerId) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const { address, payment, timeSlot, items, paymentMode: paymentModeRaw } =
      req.body || {};

    const payload = validateWithJoi(createFinanceOrderSchema, {
      items,
      address,
      paymentMode:
        normalizePaymentMode(paymentModeRaw) ||
        normalizePaymentMode(payment?.paymentMode) ||
        inferPaymentMode(payment) ||
        "COD",
      timeSlot: timeSlot || "now",
    });

    const idempotencyKey = String(req.headers?.["idempotency-key"] || "").trim() || null;
    const placement = await placeOrderAtomic({
      customerId,
      payload,
      idempotencyKey,
    });

    return handleResponse(
      res,
      placement.duplicate ? 200 : 201,
      placement.duplicate
        ? "Duplicate request resolved using existing order"
        : "Order placed successfully",
      {
        order: placement.order,
        orders: placement.orders,
        checkoutGroup: placement.checkoutGroup,
        paymentRef:
          placement.checkoutGroup?.checkoutGroupId ||
          placement.order?.orderId ||
          null,
      },
    );
  } catch (error) {
    console.error("Place Order Error:", error);
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
/* ===============================
   GET CUSTOMER ORDERS
================================ */
export const getMyOrders = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const [orders, total] = await Promise.all([
      Order.find({ customer: customerId })
        .select(
          "orderId checkoutGroupId customer seller items address payment pricing status workflowStatus workflowVersion returnStatus timeSlot createdAt",
        )
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("items.product", "name mainImage price salePrice")
        .lean(),
      Order.countDocuments({ customer: customerId }),
    ]);

    return handleResponse(res, 200, "Orders fetched successfully", {
      items: orders,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER RETURNS (Admin/Seller)
================================ */
export const getSellerReturns = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { status, startDate, endDate } = req.query;

    const query = {};

    if (role !== "admin") {
      query.seller = userId;
    }

    query.returnStatus = { $ne: "none" };

    if (status && status !== "all") {
      query.returnStatus = status;
    }

    if (startDate || endDate) {
      query.returnRequestedAt = {};
      if (startDate) {
        query.returnRequestedAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.returnRequestedAt.$lte = end;
      }
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const [orders, total] = await Promise.all([
      Order.find(query)
        .sort({ returnRequestedAt: -1, createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .populate("customer", "name phone")
        .populate("returnDeliveryBoy", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Seller returns fetched", {
      items: orders,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/** Populated ref `{ _id, ... }` or raw ObjectId string — safe id string for ACL checks */
function refToIdString(ref) {
  if (ref == null) return "";
  if (typeof ref === "object" && ref._id != null) return String(ref._id);
  return String(ref);
}

/* ===============================
   GET ORDER DETAILS
================================ */
export const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { role } = req.user;
    const userId = req.user?.id ?? req.user?._id;
    const uid = userId != null ? String(userId).trim() : "";

    const orderKey = orderMatchQueryFlexible(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey)
      .populate("customer", "name email phone")
      .populate("items.product", "name mainImage price salePrice")
      .populate("deliveryBoy", "name phone")
      .populate("returnDeliveryBoy", "name phone")
      .populate("seller", "shopName name address phone location")
      .lean();

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    // BUGFIX: Defensive check for customer reference integrity
    // If customer field is null or undefined, log error and attempt recovery
    if (!order.customer) {
      console.error(`[ORDER_BUG] Order ${orderId} has null/undefined customer field`, {
        orderId: order.orderId,
        _id: order._id,
        workflowStatus: order.workflowStatus,
        timestamp: new Date().toISOString(),
      });
      
      // Attempt to fetch order without populate to check raw customer field
      const rawOrder = await Order.findOne(orderKey).lean();
      if (rawOrder && rawOrder.customer) {
        // Customer reference exists but failed to populate
        console.error(`[ORDER_BUG] Customer reference exists but failed to populate`, {
          orderId: order.orderId,
          customerRef: rawOrder.customer,
        });
        // Use the raw customer reference for authorization
        order.customer = rawOrder.customer;
      } else {
        // Customer field is truly null/undefined in database
        console.error(`[ORDER_BUG] Customer field is null in database`, {
          orderId: order.orderId,
        });
        return handleResponse(
          res,
          500,
          "Order data integrity error: customer reference is missing",
        );
      }
    }

    if (!order.workflowStatus) {
      order.workflowStatus = resolveWorkflowStatus(order);
    }

    // --- Data Isolation Check ---
    const roleNorm = String(role || "").toLowerCase();
    const sellerIdStr =
      typeof order.seller === "object" && order.seller?._id
        ? order.seller._id.toString()
        : order.seller?.toString();
    
    // BUGFIX: Normalize customer reference to handle both populated and unpopulated cases
    const customerIdStr = refToIdString(order.customer);
    
    const isOwnerCustomer =
      (roleNorm === "customer" || roleNorm === "user") &&
      order.customer &&
      customerIdStr === uid;
    const isOwnerSeller = role === "seller" && sellerIdStr === uid;
    const primaryRiderId = refToIdString(order.deliveryBoy);
    const returnRiderId = refToIdString(order.returnDeliveryBoy);
    const isAssignedDeliveryBoy =
      role === "delivery" &&
      (primaryRiderId === uid || returnRiderId === uid);
    const isAdmin = role === "admin";

    if (
      !isOwnerCustomer &&
      !isOwnerSeller &&
      !isAssignedDeliveryBoy &&
      !isAdmin
    ) {
      // BUGFIX: Improved error message to distinguish authorization failure from missing order
      console.warn(`[ORDER_ACCESS] Authorization denied for order ${orderId}`, {
        orderId: order.orderId,
        requestedBy: uid,
        role: roleNorm,
        customerIdStr,
        hasCustomer: !!order.customer,
      });
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to view this order.",
      );
    }
    // -----------------------------

    return handleResponse(res, 200, "Order details fetched", order);
  } catch (error) {
    console.error(`[ORDER_ERROR] Error fetching order details:`, error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   CANCEL ORDER
================================ */
export const cancelOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    const customerId = req.user.id;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne({ ...orderKey, customer: customerId });

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (order.workflowVersion >= 2) {
      try {
        const updated = await customerCancelV2(
          customerId,
          order.orderId,
          reason,
        );
        return handleResponse(res, 200, "Order cancelled successfully", updated);
      } catch (e) {
        return handleResponse(res, e.statusCode || 500, e.message);
      }
    }

    if (order.status !== "pending") {
      return handleResponse(
        res,
        400,
        "Order cannot be cancelled after confirmation",
      );
    }

    order.status = "cancelled";
    order.orderStatus = "cancelled";
    order.cancelledBy = "customer";
    order.cancelReason = reason || "Cancelled by user";
    await order.save();

    if (order.paymentBreakdown?.grandTotal != null) {
      try {
        await reverseOrderFinanceOnCancellation(order._id, {
          actorId: customerId,
          reason: reason || "Cancelled by customer before acceptance",
        });
      } catch (financeError) {
        console.warn("[cancelOrder] finance reversal failed:", financeError.message);
      }
    }

    return handleResponse(res, 200, "Order cancelled successfully", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REQUEST RETURN (Customer)
================================ */
export const requestReturn = async (req, res) => {
  try {
    const { orderId } = req.params;
    const customerId = req.user.id;
    const { items, reason, images } = req.body || {};

    if (!Array.isArray(items) || items.length === 0) {
      return handleResponse(
        res,
        400,
        "Please select at least one item to return.",
      );
    }
    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return handleResponse(res, 400, "Return reason is required.");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne({ ...orderKey, customer: customerId });

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (order.status !== "delivered") {
      return handleResponse(
        res,
        400,
        "Return can only be requested for delivered orders.",
      );
    }

    if (order.returnStatus && order.returnStatus !== "none") {
      return handleResponse(
        res,
        400,
        "Return request already exists for this order.",
      );
    }

    const now = new Date();
    const deliveredAt = order.deliveredAt || order.updatedAt || order.createdAt;
    const deadline =
      order.returnDeadline ||
      new Date(deliveredAt.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (now > deadline) {
      return handleResponse(
        res,
        400,
        "Return window has expired for this order.",
      );
    }

    const selectedItems = [];
    for (const entry of items) {
      const { itemIndex, quantity } = entry || {};
      if (
        typeof itemIndex !== "number" ||
        itemIndex < 0 ||
        itemIndex >= order.items.length
      ) {
        return handleResponse(res, 400, "Invalid item selection for return.");
      }
      const original = order.items[itemIndex];
      const qty = Number(quantity) || original.quantity;
      if (qty <= 0 || qty > original.quantity) {
        return handleResponse(
          res,
          400,
          "Invalid quantity for one of the return items.",
        );
      }

      selectedItems.push({
        product: original.product,
        name: original.name,
        quantity: qty,
        price: original.price,
        variantSlot: original.variantSlot,
        itemIndex,
        status: "requested",
      });
    }

    order.returnStatus = "return_requested";
    order.returnReason = reason.trim();
    order.returnImages = Array.isArray(images) ? images.slice(0, 5) : [];
    order.returnItems = selectedItems;
    order.returnRequestedAt = now;
    order.returnDeadline = deadline;

    await order.save();

    return handleResponse(
      res,
      200,
      "Return request submitted successfully",
      order,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET RETURN DETAILS (Order-scoped)
================================ */
export const getReturnDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey)
      .populate("customer", "name phone")
      .populate("seller", "shopName name")
      .populate("returnDeliveryBoy", "name phone");

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const isOwnerCustomer =
      (role === "customer" || role === "user") &&
      order.customer?._id?.toString() === userId;
    const isOwnerSeller =
      role === "seller" && order.seller?._id?.toString() === userId;
    const isAssignedReturnDelivery =
      role === "delivery" &&
      order.returnDeliveryBoy?._id?.toString() === userId;
    const isAdmin = role === "admin";

    if (
      !isOwnerCustomer &&
      !isOwnerSeller &&
      !isAssignedReturnDelivery &&
      !isAdmin
    ) {
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to view this return.",
      );
    }

    let returnDeliveryCommission = order.returnDeliveryCommission;
    if (
      returnDeliveryCommission === undefined ||
      returnDeliveryCommission === null
    ) {
      try {
        const settings = await Setting.findOne({});
        returnDeliveryCommission = settings?.returnDeliveryCommission ?? 0;
      } catch {
        returnDeliveryCommission = 0;
      }
    }

    const payload = {
      orderId: order.orderId,
      status: order.status,
      returnStatus: order.returnStatus,
      returnReason: order.returnReason,
      returnRejectedReason: order.returnRejectedReason,
      returnRequestedAt: order.returnRequestedAt,
      returnDeadline: order.returnDeadline,
      returnImages: order.returnImages || [],
      returnItems: order.returnItems || [],
      returnRefundAmount: order.returnRefundAmount,
      returnDeliveryCommission,
      returnDeliveryBoy: order.returnDeliveryBoy || null,
    };

    return handleResponse(res, 200, "Return details fetched", payload);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE ORDER STATUS (Admin/Seller/Delivery)
================================ */
export const updateOrderStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { status, deliveryBoyId } = req.body;
    const { id: userId, role } = req.user;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const canonicalOrderId = order.orderId;

    if (order.workflowVersion >= 2 && role === "seller") {
      if (status === "confirmed") {
        try {
          const updated = await sellerAcceptAtomic(userId, canonicalOrderId);
          return handleResponse(res, 200, "Order accepted", updated);
        } catch (e) {
          return handleResponse(res, e.statusCode || 500, e.message);
        }
      }
      if (status === "cancelled") {
        try {
          const updated = await sellerRejectAtomic(userId, canonicalOrderId);
          return handleResponse(res, 200, "Order rejected", updated);
        } catch (e) {
          return handleResponse(res, e.statusCode || 500, e.message);
        }
      }
    }

    // --- Data Isolation Check ---
    const isOwnerSeller =
      role === "seller" && order.seller?.toString() === userId;
    const isAssignedDeliveryBoy =
      role === "delivery" && order.deliveryBoy?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isOwnerSeller && !isAssignedDeliveryBoy && !isAdmin) {
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to update this order.",
      );
    }
    // -----------------------------

    const oldStatus = order.status;
    if (status) {
      order.status = status;
      order.orderStatus = status;
    }
    if (deliveryBoyId) order.deliveryBoy = deliveryBoyId;

    // Legacy orders: keep rider UI step in sync with status (delivery app refresh-safe)
    if (
      isAssignedDeliveryBoy &&
      role === "delivery" &&
      order.workflowVersion < 2 &&
      status
    ) {
      if (status === "packed") order.deliveryRiderStep = 2;
      else if (status === "out_for_delivery") order.deliveryRiderStep = 3;
    }

    // Handle Cancellation (Stock Reversal & Transaction Update)
    if (status === "cancelled" && oldStatus !== "cancelled") {
      // 1. Reverse Stock
      for (const item of order.items) {
        await Product.findByIdAndUpdate(item.product, {
          $inc: { stock: item.quantity },
        });

        await StockHistory.create({
          product: item.product,
          seller: order.seller,
          type: "Correction",
          quantity: item.quantity,
          note: `Order #${canonicalOrderId} Cancelled`,
          order: order._id,
        });
      }

      // 2. Update Transaction
      await Transaction.findOneAndUpdate(
        { reference: canonicalOrderId },
        { status: "Failed" },
      );

      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId: canonicalOrderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });
    }

    // Handle Confirmation/Delivery (Settle Transaction for Demo)
    if (status === "delivered" && oldStatus !== "delivered") {
      order.deliveredAt = new Date();

      // Important: persist deliveryBoy/status first so settlement can correctly:
      // - queue rider payout
      // - mark COD cash collected (system float)
      await order.save();
      await applyDeliveredSettlement(order, canonicalOrderId);

      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_DELIVERED, {
        orderId: canonicalOrderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        deliveryId: order.deliveryBoy,
      });

      const refreshed = await Order.findById(order._id);
      return handleResponse(res, 200, "Order status updated", refreshed || order);
    }

    console.log("Saving order with new status:", status);
    await order.save();

    if (status === "confirmed" && role === "seller") {
      // This order is now 'Automatic' for delivery partners
      console.log("Order confirmed, available for delivery.");
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CONFIRMED, {
        orderId: canonicalOrderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
      });
    }

    if (status === "packed") {
      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_PACKED, {
        orderId: canonicalOrderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        deliveryId: order.deliveryBoy,
      });
      if (order.deliveryBoy) {
        emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_READY, {
          orderId: canonicalOrderId,
          deliveryId: order.deliveryBoy,
          sellerId: order.seller,
        });
      }
    }

    if (status === "out_for_delivery") {
      emitNotificationEvent(NOTIFICATION_EVENTS.OUT_FOR_DELIVERY, {
        orderId: canonicalOrderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        deliveryId: order.deliveryBoy,
      });
    }

    return handleResponse(res, 200, "Order status updated", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   APPROVE RETURN (Seller/Admin)
================================ */
export const approveReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const isOwnerSeller =
      role === "seller" && order.seller?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isOwnerSeller && !isAdmin) {
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to approve this return.",
      );
    }

    if (order.returnStatus !== "return_requested") {
      return handleResponse(
        res,
        400,
        "Only pending return requests can be approved.",
      );
    }

    if (!Array.isArray(order.returnItems) || order.returnItems.length === 0) {
      return handleResponse(res, 400, "No return items found for this order.");
    }

    const refundAmount = order.returnItems.reduce(
      (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
      0,
    );

    const settings = await Setting.findOne({});
    const returnCommission = settings?.returnDeliveryCommission ?? 0;

    order.returnItems = order.returnItems.map((item) => ({
      ...(item.toObject?.() ?? item),
      status: "approved",
    }));
    order.returnStatus = "return_approved";
    order.returnRefundAmount = refundAmount;
    order.returnDeliveryCommission = returnCommission;

    await order.save();
    emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_INITIATED, {
      orderId: order.orderId,
      customerId: order.customer,
      userId: order.customer,
      sellerId: order.seller,
      data: {
        refundAmount,
      },
    });

    return handleResponse(res, 200, "Return request approved", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REJECT RETURN (Seller/Admin)
================================ */
export const rejectReturnRequest = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;
    const { reason } = req.body || {};

    if (!reason || typeof reason !== "string" || reason.trim().length === 0) {
      return handleResponse(res, 400, "Rejection reason is required.");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const isOwnerSeller =
      role === "seller" && order.seller?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isOwnerSeller && !isAdmin) {
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to reject this return.",
      );
    }

    if (order.returnStatus !== "return_requested") {
      return handleResponse(
        res,
        400,
        "Only pending return requests can be rejected.",
      );
    }

    order.returnStatus = "return_rejected";
    order.returnRejectedReason = reason.trim();

    await order.save();

    return handleResponse(res, 200, "Return request rejected", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ASSIGN RETURN DELIVERY (Seller/Admin)
================================ */
export const assignReturnDelivery = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;
    const { deliveryBoyId } = req.body || {};

    if (!deliveryBoyId) {
      return handleResponse(res, 400, "deliveryBoyId is required.");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const isOwnerSeller =
      role === "seller" && order.seller?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isOwnerSeller && !isAdmin) {
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to assign return pickup.",
      );
    }

    if (order.returnStatus !== "return_approved") {
      return handleResponse(
        res,
        400,
        "Return pickup can only be assigned after approval.",
      );
    }

    const partner = await Delivery.findById(deliveryBoyId);
    if (!partner) {
      return handleResponse(res, 404, "Delivery partner not found.");
    }

    order.returnDeliveryBoy = deliveryBoyId;
    order.returnStatus = "return_pickup_assigned";

    await order.save();
    emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_READY, {
      orderId: order.orderId,
      deliveryId: deliveryBoyId,
      sellerId: order.seller,
      customerId: order.customer,
    });

    return handleResponse(
      res,
      200,
      "Return pickup assigned successfully",
      order,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

const completeReturnAndRefund = async (order) => {
  if (!order) return null;
  if (order.returnStatus === "refund_completed") {
    return order;
  }

  const refundAmount =
    order.returnRefundAmount ||
    (Array.isArray(order.returnItems)
      ? order.returnItems.reduce(
          (sum, item) => sum + (item.price || 0) * (item.quantity || 0),
          0,
        )
      : 0);

  const commission = order.returnDeliveryCommission || 0;

  // 1. Credit customer wallet
  if (order.customer && refundAmount > 0) {
    const customer = await User.findById(order.customer);
    if (customer) {
      customer.walletBalance = (customer.walletBalance || 0) + refundAmount;
      await customer.save();

      await Transaction.create({
        user: customer._id,
        userModel: "User",
        order: order._id,
        type: "Refund",
        amount: refundAmount,
        status: "Settled",
        reference: `REF-CUST-${order.orderId}`,
      });
    }
  }

  // 2. Seller adjustment (refund + return commission)
  if (order.seller && (refundAmount > 0 || commission > 0)) {
    const adjustment = -Math.abs(refundAmount + commission);
    await Transaction.create({
      user: order.seller,
      userModel: "Seller",
      order: order._id,
      type: "Refund",
      amount: adjustment,
      status: "Settled",
      reference: `REF-SELL-${order.orderId}`,
    });
  }

  // 3. Delivery partner earning for return pickup
  if (order.returnDeliveryBoy && commission > 0) {
    await Transaction.create({
      user: order.returnDeliveryBoy,
      userModel: "Delivery",
      order: order._id,
      type: "Delivery Earning",
      amount: commission,
      status: "Settled",
      reference: `RET-DEL-${order.orderId}`,
    });
  }

  order.returnStatus = "refund_completed";
  if (order.payment) {
    order.payment.status = "refunded";
  }

  await order.save();
  emitNotificationEvent(NOTIFICATION_EVENTS.REFUND_COMPLETED, {
    orderId: order.orderId,
    customerId: order.customer,
    userId: order.customer,
    sellerId: order.seller,
    deliveryId: order.returnDeliveryBoy,
    data: {
      refundAmount,
      returnDeliveryCommission: commission,
    },
  });
  return order;
};

/* ===============================
   UPDATE RETURN STATUS (Delivery/Admin)
================================ */
export const updateReturnStatus = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { returnStatus } = req.body || {};
    const { id: userId, role } = req.user;

    if (!returnStatus) {
      return handleResponse(res, 400, "returnStatus is required.");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const isAssignedReturnDelivery =
      role === "delivery" && order.returnDeliveryBoy?.toString() === userId;
    const isAdmin = role === "admin";

    if (!isAssignedReturnDelivery && !isAdmin) {
      return handleResponse(
        res,
        403,
        "Access denied. You are not authorized to update this return.",
      );
    }

    const oldStatus = order.returnStatus;
    const allowedStatuses = [
      "return_pickup_assigned",
      "return_in_transit",
      "returned",
    ];

    if (!allowedStatuses.includes(returnStatus)) {
      return handleResponse(res, 400, "Invalid returnStatus value.");
    }

    // Only allow forward transitions
    const orderOf = (s) =>
      s === "return_pickup_assigned"
        ? 1
        : s === "return_in_transit"
          ? 2
          : s === "returned"
            ? 3
            : 0;

    if (orderOf(returnStatus) < orderOf(oldStatus)) {
      return handleResponse(res, 400, "Return status cannot move backwards.");
    }

    const now = new Date();

    if (returnStatus === "return_in_transit") {
      order.returnStatus = "return_in_transit";
      if (!order.returnPickedAt) {
        order.returnPickedAt = now;
      }
      await order.save();
      return handleResponse(res, 200, "Return status updated", order);
    }

    if (returnStatus === "returned") {
      order.returnStatus = "returned";
      if (!order.returnDeliveredBackAt) {
        order.returnDeliveredBackAt = now;
      }
      await order.save();

      const updated = await completeReturnAndRefund(order);
      return handleResponse(
        res,
        200,
        "Return received and refund processed",
        updated,
      );
    }

    order.returnStatus = returnStatus;
    await order.save();

    return handleResponse(res, 200, "Return status updated", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER ORDERS
================================ */
export const getSellerOrders = async (req, res) => {
  try {
    const { id: userId, role } = req.user;
    const { startDate, endDate, status: statusParam } = req.query;
    console.log("Fetching Orders - User role:", role, "User ID:", userId);

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const { orders, total } = await fetchSellerOrdersPage({
      role,
      userId,
      statusParam,
      startDate,
      endDate,
      skip,
      limit,
    });

    console.log("Fetched Orders Page:", page, "Count:", orders.length);

    return handleResponse(
      res,
      200,
      role === "admin" ? "All orders fetched" : "Seller orders fetched",
      {
        items: orders,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET AVAILABLE ORDERS (Delivery Boy)
================================ */
export const getAvailableOrders = async (req, res) => {
  try {
    const { id: userId, role } = req.user;

    if (role !== "delivery" && role !== "admin") {
      return handleResponse(
        res,
        403,
        "Access denied. Only delivery partners can view available orders.",
      );
    }

    const { requiresLocation, orders } = await fetchAvailableOrdersForDelivery({
      userId,
      requestedLimit: req.query.limit,
    });

    if (requiresLocation) {
      return handleResponse(
        res,
        200,
        "Update your location to see nearby orders",
        [],
      );
    }

    console.log(
      `Delivery Partner (${userId}) - Available orders found: ${orders.length}`,
    );

    return handleResponse(
      res,
      200,
      orders.length > 0 ? "Available orders fetched" : "No orders found",
      orders,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   ACCEPT ORDER (Delivery Boy)
================================ */
export const acceptOrder = async (req, res) => {
  try {
    const orderId = decodeURIComponent(String(req.params.orderId || "")).trim();
    const userId = req.user?.id ?? req.user?._id;
    const { role } = req.user;

    if (!userId) {
      return handleResponse(res, 401, "Invalid or incomplete token");
    }

    if (role !== "delivery" && role !== "admin") {
      return handleResponse(res, 403, "Access denied.");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    if (order.workflowVersion >= 2) {
      try {
        const idem = req.headers["idempotency-key"];
        const { order: updated, duplicate } = await deliveryAcceptAtomic(
          userId,
          order.orderId,
          idem,
        );
        return handleResponse(
          res,
          200,
          duplicate ? "Already accepted" : "Order accepted successfully",
          updated,
        );
      } catch (e) {
        return handleResponse(res, e.statusCode || 500, e.message);
      }
    }

    if (order.deliveryBoy) {
      return handleResponse(
        res,
        400,
        "Order already assigned to another delivery partner",
      );
    }

    order.deliveryBoy = userId;
    if (order.status === "pending") {
      order.status = "confirmed";
    }

    await order.save();
    emitNotificationEvent(NOTIFICATION_EVENTS.DELIVERY_ASSIGNED, {
      orderId: order.orderId,
      deliveryId: userId,
      customerId: order.customer,
      sellerId: order.seller,
    });

    return handleResponse(res, 200, "Order accepted successfully", order);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   SKIP ORDER (Delivery Boy)
================================ */
export const skipOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId, role } = req.user;

    if (role !== "delivery" && role !== "admin") {
      return handleResponse(res, 403, "Access denied.");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey);

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    // Add user to skippedBy array if not already there
    if (order.workflowVersion >= 2) {
      if (order.workflowStatus !== WORKFLOW_STATUS.DELIVERY_SEARCH) {
        return handleResponse(
          res,
          400,
          "Order cannot be skipped in current state",
        );
      }
    }

    if (!order.skippedBy.includes(userId)) {
      order.skippedBy.push(userId);
      await order.save();
    }

    return handleResponse(res, 200, "Order skipped successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

