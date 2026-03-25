/**
 * Emits Socket.IO events for order workflow. Safe if socket not initialized.
 */

import mongoose from "mongoose";
import Notification from "../models/notification.js";
import { getDeliveryPartnerIdsWithinSellerRadius } from "./deliveryNearbyService.js";

let _getIo = null;

export function registerOrderSocketGetter(fn) {
  _getIo = fn;
}

function getIo() {
  try {
    return _getIo ? _getIo() : null;
  } catch {
    return null;
  }
}

function normalizeSellerId(sellerId) {
  if (sellerId == null) return null;
  if (typeof sellerId === "object" && sellerId._id) {
    return sellerId._id.toString();
  }
  return String(sellerId);
}

function normalizeDeliveryId(deliveryId) {
  if (deliveryId == null) return null;
  if (typeof deliveryId === "object" && deliveryId._id) {
    return deliveryId._id.toString();
  }
  return String(deliveryId);
}

/**
 * Emit workflow status to the order room (clients that joined `join_order`)
 * and optionally to the customer’s personal room so the app updates even before
 * opening order details (e.g. checkout success overlay).
 */
export function emitOrderStatusUpdate(orderId, payload, customerId) {
  const s = getIo();
  if (!s) return;
  const body = {
    orderId,
    ...payload,
    at: new Date().toISOString(),
  };
  s.to(`order:${orderId}`).emit("order:status:update", body);
  const cid =
    customerId != null &&
    typeof customerId === "object" &&
    typeof customerId.toString === "function"
      ? customerId.toString()
      : customerId;
  if (cid) {
    s.to(`customer:${cid}`).emit("order:status:update", body);
  }
}

export function emitToSeller(sellerId, { event, payload }) {
  const s = getIo();
  if (!s || !sellerId) return;
  s.to(`seller:${sellerId}`).emit(event, payload);
}

/**
 * Notify only delivery partners whose live location is within the seller's
 * service radius (see Delivery model location + Seller.serviceRadius).
 */
export async function emitDeliveryBroadcastForSeller(sellerId, payload) {
  const s = getIo();
  const sid = normalizeSellerId(sellerId);
  if (!sid) return;

  const ids = await getDeliveryPartnerIdsWithinSellerRadius(sid);
  if (!ids.length) {
    console.warn(
      "[emitDeliveryBroadcastForSeller] No riders in seller service radius",
      sid,
    );
    if (process.env.NODE_ENV === "production") return;
    if (s) {
      console.warn(
        "[emitDeliveryBroadcastForSeller] DEV fallback: delivery:online",
      );
      s.to("delivery:online").emit("delivery:broadcast", {
        ...payload,
        at: new Date().toISOString(),
        _devFallback: true,
      });
    }
    return;
  }

  console.log(
    `[emitDeliveryBroadcastForSeller] ${ids.length} rider(s) in radius for seller ${sid} order ${payload.orderId}`,
  );

  const body = {
    ...payload,
    at: new Date().toISOString(),
  };

  if (s) {
    for (const id of ids) {
      s.to(`delivery:${id}`).emit("delivery:broadcast", body);
    }
  }

  // Avoid duplicate DB rows when delivery search retries with wider ring
  if (!payload.retryAttempt) {
    try {
      await Notification.insertMany(
        ids.map((id) => ({
          recipient: new mongoose.Types.ObjectId(id),
          recipientModel: "Delivery",
          title: "New delivery order",
          message: `Order ${payload.orderId} — tap Accept on the alert or open this list.`,
          type: "order",
          data: {
            orderId: payload.orderId,
            preview: payload.preview || null,
            deliverySearchExpiresAt: payload.deliverySearchExpiresAt || null,
          },
        })),
        { ordered: false },
      );
    } catch (e) {
      console.warn("[emitDeliveryBroadcastForSeller] notifications", e.message);
    }
  }
}

/**
 * Retract an order request from every delivery partner except the winner.
 * This clears stale push/in-app notifications and closes any open popup.
 */
export async function retractDeliveryBroadcastForOrder(orderId, winnerDeliveryId) {
  const s = getIo();
  const winnerId = normalizeDeliveryId(winnerDeliveryId);
  const winnerObjectId =
    winnerId && mongoose.Types.ObjectId.isValid(winnerId)
      ? new mongoose.Types.ObjectId(winnerId)
      : null;

  try {
    const query = {
      recipientModel: "Delivery",
      type: "order",
      "data.orderId": orderId,
    };

    if (winnerObjectId) {
      query.recipient = { $ne: winnerObjectId };
    }

    const notifications = await Notification.find(query)
      .select("_id recipient")
      .lean();

    if (!notifications.length) {
      if (s) {
        s.to("delivery:online").emit("delivery:broadcast:withdrawn", {
          orderId,
          winnerDeliveryId: winnerId,
          at: new Date().toISOString(),
        });
      }
      return { removedCount: 0 };
    }

    const recipientIds = [
      ...new Set(
        notifications
          .map((n) => n.recipient?.toString?.() || String(n.recipient || ""))
          .filter(Boolean),
      ),
    ];

    if (s) {
      for (const recipientId of recipientIds) {
        s.to(`delivery:${recipientId}`).emit("delivery:broadcast:withdrawn", {
          orderId,
          winnerDeliveryId: winnerId,
          at: new Date().toISOString(),
        });
      }
    }

    await Notification.deleteMany({
      recipientModel: "Delivery",
      type: "order",
      "data.orderId": orderId,
      ...(winnerObjectId ? { recipient: { $ne: winnerObjectId } } : {}),
    });

    return { removedCount: notifications.length };
  } catch (error) {
    console.warn(
      "[retractDeliveryBroadcastForOrder] failed",
      orderId,
      error.message,
    );
    return { removedCount: 0 };
  }
}

/** Broadcast to all sockets in delivery:online (legacy / dev only). */
export function emitDeliveryBroadcast(payload) {
  const s = getIo();
  if (!s) return;
  s.to("delivery:online").emit("delivery:broadcast", {
    ...payload,
    at: new Date().toISOString(),
  });
}

export function emitToCustomer(customerId, { event, payload }) {
  const s = getIo();
  if (!s || !customerId) return;
  s.to(`customer:${customerId}`).emit(event, payload);
}
