import Order from "../models/order.js";
import Delivery from "../models/delivery.js";
import Seller from "../models/seller.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { distanceMeters } from "../utils/geoUtils.js";

function normalizeSellerStatusFilter(statusParam) {
  if (!statusParam || statusParam === "all") {
    return {};
  }

  if (statusParam === "pending") {
    return { status: "pending" };
  }
  if (statusParam === "processed") {
    return { status: { $in: ["confirmed", "packed"] } };
  }
  if (statusParam === "out-for-delivery") {
    return { status: "out_for_delivery" };
  }
  if (statusParam === "delivered") {
    return { status: "delivered" };
  }
  if (statusParam === "cancelled") {
    return { status: "cancelled" };
  }
  if (statusParam === "returned") {
    return { returnStatus: { $ne: "none" } };
  }

  return {};
}

function appendDateRange(query, { startDate, endDate }) {
  if (!startDate && !endDate) {
    return query;
  }

  const range = {};
  if (startDate) {
    range.$gte = new Date(startDate);
  }
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }

  return {
    ...query,
    createdAt: range,
  };
}

export function buildSellerOrdersQuery({
  role,
  userId,
  statusParam,
  startDate,
  endDate,
}) {
  const base = role === "admin" ? {} : { seller: userId };
  const withStatus = {
    ...base,
    ...normalizeSellerStatusFilter(statusParam),
  };
  return appendDateRange(withStatus, { startDate, endDate });
}

export async function fetchSellerOrdersPage({
  role,
  userId,
  statusParam,
  startDate,
  endDate,
  skip,
  limit,
}) {
  const query = buildSellerOrdersQuery({
    role,
    userId,
    statusParam,
    startDate,
    endDate,
  });

  const [orders, total, summaryRows] = await Promise.all([
    Order.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate("customer", "name phone")
      .populate("items.product", "name mainImage price salePrice")
      .populate("deliveryBoy", "name phone")
      .populate("seller", "shopName name")
      .lean(),
    Order.countDocuments(query),
    Order.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalAmount: { $sum: { $ifNull: ["$pricing.total", 0] } },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          confirmed: {
            $sum: { $cond: [{ $eq: ["$status", "confirmed"] }, 1, 0] },
          },
          packed: {
            $sum: { $cond: [{ $eq: ["$status", "packed"] }, 1, 0] },
          },
          outForDelivery: {
            $sum: { $cond: [{ $eq: ["$status", "out_for_delivery"] }, 1, 0] },
          },
          delivered: {
            $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
          },
          cancelled: {
            $sum: { $cond: [{ $eq: ["$status", "cancelled"] }, 1, 0] },
          },
          returned: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$returnStatus", null] },
                    { $ne: ["$returnStatus", ""] },
                    { $ne: ["$returnStatus", "none"] },
                  ],
                },
                1,
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const rawSummary = summaryRows?.[0] || {};
  const summary = {
    totalOrders: Number(rawSummary.totalOrders || 0),
    totalAmount: Number(rawSummary.totalAmount || 0),
    pending: Number(rawSummary.pending || 0),
    confirmed: Number(rawSummary.confirmed || 0),
    packed: Number(rawSummary.packed || 0),
    outForDelivery: Number(rawSummary.outForDelivery || 0),
    delivered: Number(rawSummary.delivered || 0),
    cancelled: Number(rawSummary.cancelled || 0),
    returned: Number(rawSummary.returned || 0),
  };
  summary.activeOrders =
    summary.pending +
    summary.confirmed +
    summary.packed +
    summary.outForDelivery;

  return {
    query,
    orders,
    total,
    summary,
  };
}

function parseAvailableOrdersLimit(requestedLimit) {
  const maxLimit = 50;
  const parsed = parseInt(requestedLimit, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 20;
  }
  return Math.min(parsed, maxLimit);
}

async function resolveNearbySellerIds(deliveryPartner, userId) {
  const nearbySellers = await Seller.find({
    location: {
      $near: {
        $geometry: deliveryPartner.location,
        $maxDistance: 5000,
      },
    },
  }).select("_id");

  let sellerIds = nearbySellers.map((seller) => seller._id);
  let usedFallback = false;

  if (sellerIds.length === 0 && process.env.NODE_ENV !== "production") {
    const allSellers = await Seller.find({}).select("_id");
    sellerIds = allSellers.map((seller) => seller._id);
    usedFallback = true;
    console.log(
      `DEV LOG - Radius search found 0 sellers. Bypassing radius check for Delivery Partner: ${userId}`,
    );
  }

  return {
    sellerIds,
    usedFallback,
  };
}

function filterV2OrdersByRadius(v2Orders, deliveryCoords) {
  const [dlng, dlat] = deliveryCoords;
  return v2Orders.filter((order) => {
    const coords = order.seller?.location?.coordinates;
    if (!Array.isArray(coords) || coords.length < 2) return true;

    const [slng, slat] = coords;
    const searchR = order.deliverySearchMeta?.radiusMeters || 5000;
    const serviceKm = Number(order.seller?.serviceRadius ?? 5);
    const serviceM = Math.max(serviceKm, 0) * 1000;
    const maxR = Math.min(searchR, serviceM);
    return distanceMeters(dlat, dlng, slat, slng) <= maxR;
  });
}

function mergeAvailableOrders(v2Orders, legacyOrders, returnPickups, limit) {
  const seen = new Set();
  const merged = [];

  for (const order of [...v2Orders, ...legacyOrders, ...returnPickups]) {
    if (seen.has(order.orderId)) continue;
    seen.add(order.orderId);
    merged.push(order);
    if (merged.length >= limit) break;
  }

  return merged;
}

export async function fetchAvailableOrdersForDelivery({
  userId,
  requestedLimit,
  type = "delivery",
}) {
  const limit = parseAvailableOrdersLimit(requestedLimit);
  const showDeliveries = type === "delivery" || type === "all";
  const showReturns = type === "return" || type === "all";

  let assignedReturnPickups = [];
  if (showReturns) {
    const assignedReturnPickupsRaw = await Order.find({
      returnStatus: "return_pickup_assigned",
      returnDeliveryBoy: userId,
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();

    assignedReturnPickups = assignedReturnPickupsRaw.map((rp) => ({
      ...rp,
      isReturnPickup: true,
    }));
  }

  const deliveryPartner = await Delivery.findById(userId);
  if (
    !deliveryPartner ||
    !deliveryPartner.location ||
    !Array.isArray(deliveryPartner.location.coordinates)
  ) {
    return {
      requiresLocation: showDeliveries && assignedReturnPickups.length === 0,
      orders: assignedReturnPickups,
      limit,
    };
  }

  const { sellerIds } = await resolveNearbySellerIds(deliveryPartner, userId);

  let v2Orders = [];
  if (showDeliveries) {
    const v2OrdersRaw = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliveryBoy: null,
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location serviceRadius")
      .lean();

    v2Orders = filterV2OrdersByRadius(
      v2OrdersRaw,
      deliveryPartner.location.coordinates,
    );
  }

  let legacyOrders = [];
  if (showDeliveries) {
    legacyOrders = await Order.find({
      $or: [
        { workflowVersion: { $exists: false } },
        { workflowVersion: { $lt: 2 } },
      ],
      status: { $in: ["confirmed", "packed"] },
      deliveryBoy: null,
      seller: { $in: sellerIds },
      skippedBy: { $nin: [userId] },
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();
  }

  let returnPickups = [];
  if (showReturns) {
    const returnPickupsRaw = await Order.find({
      returnStatus: { $in: ["return_approved", "return_pickup_assigned"] },
      skippedBy: { $nin: [userId] },
      $or: [
        {
          returnDeliveryBoy: null,
          seller: { $in: sellerIds },
        },
        {
          returnDeliveryBoy: userId,
        },
      ],
    })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate("customer", "name phone")
      .populate("seller", "shopName address name location")
      .lean();

    returnPickups = returnPickupsRaw.map((rp) => ({
      ...rp,
      isReturnPickup: true,
    }));
  }

  const orders = mergeAvailableOrders(
    v2Orders,
    legacyOrders,
    [...assignedReturnPickups, ...returnPickups],
    limit,
  );

  return {
    requiresLocation: false,
    orders,
    limit,
  };
}

export default {
  buildSellerOrdersQuery,
  fetchSellerOrdersPage,
  fetchAvailableOrdersForDelivery,
};
