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

  const [orders, total] = await Promise.all([
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
  ]);

  return {
    query,
    orders,
    total,
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

function mergeAvailableOrders(v2Orders, legacyOrders, limit) {
  const seen = new Set();
  const merged = [];

  for (const order of [...v2Orders, ...legacyOrders]) {
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
}) {
  const deliveryPartner = await Delivery.findById(userId);
  if (
    !deliveryPartner ||
    !deliveryPartner.location ||
    !Array.isArray(deliveryPartner.location.coordinates)
  ) {
    return {
      requiresLocation: true,
      orders: [],
      limit: parseAvailableOrdersLimit(requestedLimit),
    };
  }

  const { sellerIds } = await resolveNearbySellerIds(deliveryPartner, userId);
  const limit = parseAvailableOrdersLimit(requestedLimit);

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

  const v2Orders = filterV2OrdersByRadius(
    v2OrdersRaw,
    deliveryPartner.location.coordinates,
  );

  const legacyOrders = await Order.find({
    $or: [{ workflowVersion: { $exists: false } }, { workflowVersion: { $lt: 2 } }],
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

  const orders = mergeAvailableOrders(v2Orders, legacyOrders, limit);
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
