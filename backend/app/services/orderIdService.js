import crypto from "crypto";
import Order from "../models/order.js";

function dateStampUTC(date = new Date()) {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

export function buildPublicOrderId() {
  const stamp = dateStampUTC();
  const randomPart = crypto.randomUUID().replace(/-/g, "").slice(0, 14).toUpperCase();
  return `ORD-${stamp}-${randomPart}`;
}

export async function generateUniquePublicOrderId({ session = null, maxAttempts = 5 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const candidate = buildPublicOrderId();
    const query = Order.exists({ orderId: candidate });
    if (session) {
      query.session(session);
    }
    const exists = await query;
    if (!exists) {
      return candidate;
    }
  }
  const err = new Error("Unable to generate a unique order id");
  err.statusCode = 500;
  throw err;
}
