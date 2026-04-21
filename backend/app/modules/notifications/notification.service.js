import { EventEmitter } from "events";
import Notification from "./notification.model.js";
import NotificationPreference from "./preference.model.js";
import { buildNotification } from "./notification.builder.js";
import {
  DEFAULT_DEDUP_TTL_SECONDS,
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
  NOTIFICATIONS_ENABLED,
} from "./notification.constants.js";
import { getRedisClient } from "../../config/redis.js";
import logger from "../../services/logger.js";
import { incrementCounter, setGauge } from "../../services/metrics.js";
import { deliverNotificationById } from "./notification.worker.js";

const notificationEmitter = new EventEmitter();
const localDedupeStore = new Map();
let listenerRegistered = false;

function dedupeKeyForNotification(eventType, notification, payload = {}) {
  const orderRef =
    payload.messageId ||
    payload.messageCreatedAt ||
    payload.ticketId ||
    payload.orderId ||
    payload.productId ||
    payload.variantSku ||
    notification?.data?.orderId ||
    notification?.data?.productId ||
    notification?.data?.variantSku ||
    payload.checkoutGroupId ||
    payload.userId ||
    notification?.userId ||
    "unknown";
  return [
    "notify",
    String(eventType || "UNKNOWN"),
    String(notification?.role || "unknown"),
    String(notification?.userId || "unknown"),
    String(orderRef || "unknown"),
  ].join(":");
}

function cleanLocalDedupeStore(now = Date.now()) {
  for (const [key, expiresAt] of localDedupeStore.entries()) {
    if (expiresAt <= now) {
      localDedupeStore.delete(key);
    }
  }
}

async function claimDedupeKey(key, ttlSeconds) {
  const redis = getRedisClient();
  if (redis) {
    try {
      const result = await redis.set(key, "1", "EX", ttlSeconds, "NX");
      return result === "OK";
    } catch (error) {
      logger.warn("Redis dedupe check failed, falling back to local dedupe", {
        message: error.message,
      });
    }
  }

  const now = Date.now();
  cleanLocalDedupeStore(now);
  const existingExpiry = localDedupeStore.get(key);
  if (existingExpiry && existingExpiry > now) {
    return false;
  }
  localDedupeStore.set(key, now + ttlSeconds * 1000);
  return true;
}

function isOrderUpdateEvent(eventType) {
  return [
    NOTIFICATION_EVENTS.ORDER_PLACED,
    NOTIFICATION_EVENTS.PAYMENT_SUCCESS,
    NOTIFICATION_EVENTS.ORDER_CONFIRMED,
    NOTIFICATION_EVENTS.ORDER_PACKED,
    NOTIFICATION_EVENTS.OUT_FOR_DELIVERY,
    NOTIFICATION_EVENTS.ORDER_DELIVERED,
    NOTIFICATION_EVENTS.ORDER_CANCELLED,
    NOTIFICATION_EVENTS.REFUND_INITIATED,
    NOTIFICATION_EVENTS.REFUND_COMPLETED,
    NOTIFICATION_EVENTS.NEW_ORDER,
    NOTIFICATION_EVENTS.RETURN_REQUESTED,
    NOTIFICATION_EVENTS.RETURN_APPROVED,
    NOTIFICATION_EVENTS.RETURN_REJECTED,
    NOTIFICATION_EVENTS.RETURN_COMPLETED,
  ].includes(eventType);
}

function isDeliveryUpdateEvent(eventType) {
  return [
    NOTIFICATION_EVENTS.DELIVERY_ASSIGNED,
    NOTIFICATION_EVENTS.ORDER_READY,
    NOTIFICATION_EVENTS.RETURN_PICKUP_ASSIGNED,
    NOTIFICATION_EVENTS.RETURN_PICKUP_OTP,
  ].includes(eventType);
}

async function getPreference(userId, role) {
  return NotificationPreference.findOneAndUpdate(
    {
      userId,
      role,
    },
    {
      $setOnInsert: {
        userId,
        role,
      },
    },
    {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    },
  ).lean();
}

function isAllowedByPreference(eventType, preference) {
  if (!preference) return true;
  if (isDeliveryUpdateEvent(eventType)) {
    return preference.deliveryUpdates !== false;
  }
  if (isOrderUpdateEvent(eventType)) {
    return preference.orderUpdates !== false;
  }
  return true;
}

async function refreshQueueMetrics() {
  setGauge("notifications_queue_size", 0);
  setGauge("notifications_queue_waiting", 0);
  setGauge("notifications_queue_active", 0);
  setGauge("notifications_queue_failed", 0);
}

export async function notify(eventType, payload = {}) {
  if (!NOTIFICATIONS_ENABLED()) {
    return { enqueued: 0, skipped: 0, duplicates: 0, notificationIds: [] };
  }

  const notifications = buildNotification(eventType, payload);
  if (!notifications.length) {
    return { enqueued: 0, skipped: 0, duplicates: 0, notificationIds: [] };
  }

  const dedupeTtlSeconds = DEFAULT_DEDUP_TTL_SECONDS();
  let enqueued = 0;
  let skipped = 0;
  let duplicates = 0;
  const notificationIds = [];

  for (const notification of notifications) {
    try {
      const preference = await getPreference(notification.userId, notification.role);
      if (!isAllowedByPreference(eventType, preference)) {
        skipped += 1;
        continue;
      }

      const dedupeKey = dedupeKeyForNotification(eventType, notification, payload);
      const isFirstOccurrence = await claimDedupeKey(dedupeKey, dedupeTtlSeconds);
      if (!isFirstOccurrence) {
        duplicates += 1;
        incrementCounter("notifications_duplicates_total", {
          eventType,
          role: notification.role,
        });
        continue;
      }

      const notificationDoc = await Notification.create({
        ...notification,
        dedupeKey,
        status: "pending",
      });

      try {
        await deliverNotificationById(notificationDoc._id.toString());
        enqueued += 1;
        notificationIds.push(notificationDoc._id.toString());
        incrementCounter("notifications_total", {
          status: "triggered",
          eventType,
          role: notification.role,
        });
      } catch (deliveryError) {
        await Notification.updateOne(
          { _id: notificationDoc._id },
          {
            $set: {
              status: "failed",
              failureReason: deliveryError.message,
            },
          },
        );
        incrementCounter("notifications_total", {
          status: "failed",
          eventType,
          role: notification.role,
        });
        logger.error("Failed to deliver notification", {
          notificationId: notificationDoc._id.toString(),
          eventType,
          message: deliveryError.message,
        });
      }
    } catch (error) {
      skipped += 1;
      logger.error("Notification emit pipeline failed", {
        eventType,
        message: error.message,
      });
    }
  }

  await refreshQueueMetrics();
  return { enqueued, skipped, duplicates, notificationIds };
}

function registerNotificationListener() {
  if (listenerRegistered) return;
  notificationEmitter.on("notification:event", ({ eventType, payload }) => {
    notify(eventType, payload).catch((error) => {
      logger.error("Notification listener failed", {
        eventType,
        message: error.message,
      });
    });
  });
  listenerRegistered = true;
}

registerNotificationListener();

export function emitNotificationEvent(eventType, payload = {}) {
  setImmediate(() => {
    notificationEmitter.emit("notification:event", {
      eventType,
      payload,
    });
  });
}

export function emitCustomerNotification(eventType, payload = {}) {
  emitNotificationEvent(eventType, {
    ...payload,
    role: NOTIFICATION_ROLES.CUSTOMER,
  });
}

export function emitSellerNotification(eventType, payload = {}) {
  emitNotificationEvent(eventType, {
    ...payload,
    role: NOTIFICATION_ROLES.SELLER,
  });
}

export function emitDeliveryNotification(eventType, payload = {}) {
  emitNotificationEvent(eventType, {
    ...payload,
    role: NOTIFICATION_ROLES.DELIVERY,
  });
}

export default {
  notify,
  emitNotificationEvent,
  emitCustomerNotification,
  emitSellerNotification,
  emitDeliveryNotification,
};
