import mongoose from "mongoose";
import Order from "../models/order.js";

export function normalizeOrderRouteParam(raw) {
  return decodeURIComponent(String(raw ?? "")).trim();
}

function isStrictObjectIdString(s) {
  return (
    typeof s === "string" &&
    s.length === 24 &&
    mongoose.Types.ObjectId.isValid(s) &&
    new mongoose.Types.ObjectId(s).toString() === s
  );
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match an order from a route/query/body param: human orderId (e.g. ORD…) or MongoDB _id (24-char hex).
 */
export function orderMatchQueryFromRouteParam(routeParam) {
  const raw = normalizeOrderRouteParam(routeParam);
  if (!raw) return null;
  if (isStrictObjectIdString(raw)) {
    return { _id: new mongoose.Types.ObjectId(raw) };
  }
  return { orderId: raw };
}

/**
 * Same as {@link orderMatchQueryFromRouteParam} but tolerates orderId case drift (e.g. ORD vs ord)
 * by matching case-insensitively when the exact string is not found.
 * Use for read endpoints (e.g. customer order detail); keep strict matching for mutating flows when needed.
 */
export function orderMatchQueryFlexible(routeParam) {
  const raw = normalizeOrderRouteParam(routeParam);
  if (!raw) return null;
  if (isStrictObjectIdString(raw)) {
    return { _id: new mongoose.Types.ObjectId(raw) };
  }
  const esc = escapeRegex(raw);
  return {
    $or: [
      { orderId: raw },
      { orderId: new RegExp(`^${esc}$`, "i") },
      { checkoutGroupId: raw },
      { checkoutGroupId: new RegExp(`^${esc}$`, "i") },
    ],
  };
}

export async function resolveCanonicalOrderId(routeParam) {
  const q = orderMatchQueryFromRouteParam(routeParam);
  if (!q) return null;
  const doc = await Order.findOne(q).select("orderId").lean();
  return doc?.orderId ?? null;
}

export async function requireCanonicalOrderId(routeParam) {
  const rid = await resolveCanonicalOrderId(routeParam);
  if (!rid) {
    const err = new Error("Order not found");
    err.statusCode = 404;
    throw err;
  }
  return rid;
}
