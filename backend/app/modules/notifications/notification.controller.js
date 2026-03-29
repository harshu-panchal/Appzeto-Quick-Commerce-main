import mongoose from "mongoose";
import Notification from "./notification.model.js";
import PushToken from "./token.model.js";
import NotificationPreference from "./preference.model.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import {
  normalizeNotificationRole,
  ROLE_TO_USER_MODEL,
  roleFromRecipientModel,
} from "./notification.constants.js";
import { notify } from "./notification.service.js";
import { emitNotificationEvent } from "./notification.emitter.js";
import { NOTIFICATION_EVENTS } from "./notification.constants.js";

function resolveRole(req) {
  return normalizeNotificationRole(req?.user?.role);
}

function resolveNotificationFilter(req) {
  const userId = req?.user?.id;
  return {
    $or: [{ userId }, { recipient: userId }],
  };
}

function queryFromFilter(filter = {}, options = {}) {
  const query = {
    $or: filter.$or || [],
  };
  if (options.unreadOnly) {
    query.isRead = false;
  }
  if (options.status) {
    query.status = options.status;
  }
  return query;
}

function normalizeNotification(doc = {}) {
  const role = doc.role || roleFromRecipientModel(doc.recipientModel) || "customer";
  return {
    id: doc._id,
    userId: doc.userId || doc.recipient,
    role,
    type: doc.type,
    title: doc.title,
    body: doc.body || doc.message || "",
    data: doc.data || {},
    status: doc.status || "sent",
    isRead: Boolean(doc.isRead),
    createdAt: doc.createdAt,
    sentAt: doc.sentAt || doc.createdAt || null,
  };
}

export const registerPushToken = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const token = String(req.body?.token || req.query?.token || "").trim();
    const platform = String(req.body?.platform || "web").trim().toLowerCase();
    const device = String(req.body?.device || "").trim();

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }
    if (!token) {
      return handleResponse(res, 400, "Push token is required");
    }
    if (!["web", "android", "ios"].includes(platform)) {
      return handleResponse(res, 400, "platform must be one of web, android, ios");
    }

    const userModel = ROLE_TO_USER_MODEL[role];
    const tokenDoc = await PushToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId,
          role,
          userModel,
          token,
          platform,
          device,
          isActive: true,
          lastUsedAt: new Date(),
          invalidatedAt: null,
          invalidReason: "",
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    ).lean();

    return handleResponse(res, 200, "Push token registered successfully", {
      tokenId: tokenDoc?._id,
      platform: tokenDoc?.platform,
      isActive: tokenDoc?.isActive,
      lastUsedAt: tokenDoc?.lastUsedAt,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const removePushToken = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const token = String(req.body?.token || "").trim();

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const filter = token
      ? { userId, role, token }
      : { userId, role };
    const result = await PushToken.deleteMany(filter);

    return handleResponse(res, 200, "Push token removed successfully", {
      deletedTokens: Number(result.deletedCount || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getNotifications = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });
    const unreadOnly = String(req.query?.unreadOnly || "").toLowerCase() === "true";
    const status = String(req.query?.status || "").trim() || undefined;
    const baseFilter = resolveNotificationFilter(req);
    const query = queryFromFilter(baseFilter, { unreadOnly, status });

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1, _id: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({
        ...queryFromFilter(baseFilter, { status }),
        isRead: false,
      }),
    ]);

    const items = notifications.map(normalizeNotification);
    return handleResponse(res, 200, "Notifications fetched successfully", {
      items,
      notifications: items,
      unreadCount,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const markNotificationsRead = async (req, res) => {
  try {
    const userId = req?.user?.id;
    if (!userId) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const notificationId = String(
      req.body?.notificationId || req.params?.id || "",
    ).trim();
    const notificationIds = Array.isArray(req.body?.notificationIds)
      ? req.body.notificationIds.map((id) => String(id).trim()).filter(Boolean)
      : [];
    const candidateIds = notificationIds.length ? notificationIds : [notificationId];
    const validIds = candidateIds.filter((id) => mongoose.Types.ObjectId.isValid(id));
    const markAll = String(req.body?.markAll || "").toLowerCase() === "true";

    const filter =
      markAll || (!notificationId && notificationIds.length === 0)
        ? { $or: [{ userId }, { recipient: userId }], isRead: false }
        : {
            _id: { $in: validIds },
            $or: [{ userId }, { recipient: userId }],
          };

    const result = await Notification.updateMany(filter, {
      $set: { isRead: true },
    });

    return handleResponse(res, 200, "Notifications marked as read", {
      modifiedCount: Number(result.modifiedCount || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getNotificationPreferences = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const preference = await NotificationPreference.findOneAndUpdate(
      { userId, role },
      { $setOnInsert: { userId, role } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return handleResponse(res, 200, "Notification preferences fetched", preference);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updateNotificationPreferences = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const update = {};
    if (typeof req.body?.orderUpdates === "boolean") {
      update.orderUpdates = req.body.orderUpdates;
    }
    if (typeof req.body?.deliveryUpdates === "boolean") {
      update.deliveryUpdates = req.body.deliveryUpdates;
    }
    if (typeof req.body?.promotions === "boolean") {
      update.promotions = req.body.promotions;
    }

    const preference = await NotificationPreference.findOneAndUpdate(
      { userId, role },
      {
        $set: update,
        $setOnInsert: { userId, role },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).lean();

    return handleResponse(res, 200, "Notification preferences updated", preference);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const testPushNotification = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }

    const orderId = `TEST-${Date.now()}`;
    const result = await notify(NOTIFICATION_EVENTS.ORDER_PLACED, {
      orderId,
      userId,
      customerId: userId,
      role,
      data: { source: "manual_test" },
    });

    return handleResponse(res, 200, "Test push notification triggered", {
      orderId,
      notificationId: result?.notificationIds?.[0] || null,
      enqueued: Number(result?.enqueued || 0),
      duplicates: Number(result?.duplicates || 0),
      skipped: Number(result?.skipped || 0),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getTestPushNotificationStatus = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const orderId = String(req.params?.orderId || "").trim();

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }
    if (!orderId) {
      return handleResponse(res, 400, "orderId is required");
    }

    const notification = await Notification.findOne({
      $or: [{ userId }, { recipient: userId }],
      role,
      type: NOTIFICATION_EVENTS.ORDER_PLACED,
      "data.orderId": orderId,
      "data.source": "manual_test",
    })
      .sort({ createdAt: -1, _id: -1 })
      .lean();

    if (!notification) {
      return handleResponse(res, 200, "Test push notification is still being prepared", {
        orderId,
        status: "queued",
        found: false,
      });
    }

    return handleResponse(res, 200, "Test push notification status fetched", {
      orderId,
      found: true,
      notificationId: notification._id,
      status: notification.status || "pending",
      failureReason: notification.failureReason || "",
      sentAt: notification.sentAt || null,
      createdAt: notification.createdAt || null,
      deliveryStats: notification.deliveryStats || {
        attempted: 0,
        sent: 0,
        failed: 0,
        invalidTokens: 0,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export default {
  registerPushToken,
  removePushToken,
  getNotifications,
  markNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  testPushNotification,
  getTestPushNotificationStatus,
};
