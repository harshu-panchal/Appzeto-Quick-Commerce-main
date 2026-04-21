import mongoose from "mongoose";
import Notification from "./notification.model.js";
import PushToken from "./token.model.js";
import NotificationPreference from "./preference.model.js";
import handleResponse from "../../utils/helper.js";
import getPagination from "../../utils/pagination.js";
import User from "../../models/customer.js";
import Seller from "../../models/seller.js";
import Delivery from "../../models/delivery.js";
import Admin from "../../models/admin.js";
import {
  normalizeNotificationRole,
  ROLE_TO_USER_MODEL,
  ROLE_TO_RECIPIENT_MODEL,
  NOTIFICATION_ROLES,
  roleFromRecipientModel,
} from "./notification.constants.js";
import { notify } from "./notification.service.js";
import { NOTIFICATION_EVENTS } from "./notification.constants.js";
import { deliverNotificationById } from "./notification.worker.js";

function resolveRole(req) {
  return normalizeNotificationRole(req?.user?.role);
}

const BROADCAST_AUDIENCES = Object.freeze({
  all: [
    NOTIFICATION_ROLES.CUSTOMER,
    NOTIFICATION_ROLES.SELLER,
    NOTIFICATION_ROLES.DELIVERY,
  ],
  customers: [NOTIFICATION_ROLES.CUSTOMER],
  sellers: [NOTIFICATION_ROLES.SELLER],
  delivery: [NOTIFICATION_ROLES.DELIVERY],
});

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

function resolveBearerToken(req) {
  const header = String(req.headers?.authorization || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.split(" ")[1] || "";
}

function normalizeLoginUser(doc) {
  if (!doc) return null;

  // Try to match the "user" shape expected by the client (best-effort across roles).
  const walletAmount =
    Number(doc.walletAmount ?? doc.walletBalance ?? doc.wallet ?? 0) || 0;
  const status =
    typeof doc.isActive === "boolean"
      ? doc.isActive
        ? "Active"
        : "Inactive"
      : String(doc.status || "").trim() || "Active";

  return {
    id: String(doc._id || doc.id || ""),
    name: String(doc.name || ""),
    phone: String(doc.phone || ""),
    email: String(doc.email || ""),
    walletAmount,
    refCode: String(doc.refCode || doc.referralCode || ""),
    status,
  };
}

async function fetchLoginUser(userModelName, userId) {
  // Note: customer model file exports model("User"), but is used as "Customer" elsewhere.
  const MODEL_MAP = {
    User,
    Seller,
    Delivery,
    Admin,
  };

  const model = MODEL_MAP[userModelName];
  if (!model) return null;

  // Keep the projection small and safe.
  const baseProjection = "name phone email role";
  const projectionByModel = {
    User: `${baseProjection} walletBalance isActive`,
    Seller: `${baseProjection} isActive isVerified applicationStatus`,
    Delivery: `${baseProjection} isOnline isVerified`,
    Admin: `${baseProjection} isVerified`,
  };

  return model.findById(userId).select(projectionByModel[userModelName] || baseProjection).lean();
}

export const registerPushToken = async (req, res) => {
  try {
    const userId = req?.user?.id;
    const role = resolveRole(req);
    const token = String(req.body?.token || "").trim();
    const platform = String(req.body?.platform || "web").trim().toLowerCase();

    if (!userId || !role) {
      return handleResponse(res, 401, "Unauthorized");
    }
    if (!token) {
      return handleResponse(res, 400, "Push token is required");
    }
    if (!["web", "app"].includes(platform)) {
      return handleResponse(res, 400, "platform must be one of web, app");
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

    const bearerToken = resolveBearerToken(req);
    const userModelName = ROLE_TO_USER_MODEL[role];
    const userDoc = await fetchLoginUser(userModelName, userId);

    if (!userDoc) {
      return handleResponse(res, 404, "User not found");
    }

    // Client expects a login-like response for this endpoint.
    // We intentionally return the same token the client used (Bearer token),
    // and a normalized user object.
    return res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        token: bearerToken,
        user: normalizeLoginUser(userDoc),
      },
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

export const broadcastNotification = async (req, res) => {
  try {
    const role = resolveRole(req);
    const adminId = String(req?.user?.id || "").trim();
    if (!adminId || role !== NOTIFICATION_ROLES.ADMIN) {
      return handleResponse(res, 403, "Only admin can broadcast notifications");
    }

    const audience = String(req.body?.audience || "").trim().toLowerCase();
    const title = String(req.body?.title || "").trim();
    const message = String(req.body?.message || "").trim();
    const deepLink = String(req.body?.deepLink || "").trim();
    const imageUrl = String(req.body?.imageUrl || "").trim();
    const targetRoles = BROADCAST_AUDIENCES[audience];

    if (!targetRoles) {
      return handleResponse(
        res,
        400,
        "audience must be one of all, customers, sellers, delivery",
      );
    }
    if (!title) {
      return handleResponse(res, 400, "title is required");
    }
    if (!message) {
      return handleResponse(res, 400, "message is required");
    }
    if (title.length > 50) {
      return handleResponse(res, 400, "title must be 50 characters or less");
    }
    if (message.length > 200) {
      return handleResponse(res, 400, "message must be 200 characters or less");
    }

    const tokenOwners = await PushToken.find({
      role: { $in: targetRoles },
      isActive: true,
    })
      .select("userId role")
      .lean();

    const uniqueRecipients = new Map();
    for (const item of tokenOwners) {
      const userId = String(item?.userId || "").trim();
      const recipientRole = String(item?.role || "").trim();
      if (!userId || !recipientRole) continue;
      const key = `${recipientRole}:${userId}`;
      if (!uniqueRecipients.has(key)) {
        uniqueRecipients.set(key, {
          userId,
          role: recipientRole,
        });
      }
    }

    const recipients = Array.from(uniqueRecipients.values());
    if (!recipients.length) {
      return handleResponse(res, 200, "No active push recipients found for selected audience", {
        audience,
        roles: targetRoles,
        targetedUsers: 0,
        notificationsCreated: 0,
        delivered: 0,
        failed: 0,
      });
    }

    const broadcastId = `BROADCAST-${Date.now()}-${adminId.slice(-6)}`;
    const docs = recipients.map((recipient) => {
      const recipientModel = ROLE_TO_RECIPIENT_MODEL[recipient.role] || "User";
      const timestamp = Date.now();
      const dedupeKey = `${broadcastId}:${recipient.role}:${recipient.userId}:${timestamp}`;
      return {
        userId: recipient.userId,
        role: recipient.role,
        recipient: recipient.userId,
        recipientModel,
        type: "system",
        title,
        body: message,
        message,
        isRead: false,
        status: "pending",
        channel: "push",
        provider: "fcm",
        dedupeKey,
        data: {
          audience,
          deepLink,
          imageUrl,
          broadcastId,
          source: "admin_broadcast",
          sentBy: adminId,
        },
      };
    });

    const created = await Notification.insertMany(docs, { ordered: false });
    const notificationIds = created.map((item) => item?._id).filter(Boolean);
    const deliveryResults = await Promise.allSettled(
      notificationIds.map((notificationId) => deliverNotificationById(notificationId)),
    );

    const delivered = deliveryResults.filter((result) => result.status === "fulfilled").length;
    const failed = deliveryResults.length - delivered;

    return handleResponse(res, 200, "Broadcast notification sent", {
      broadcastId,
      audience,
      roles: targetRoles,
      targetedUsers: recipients.length,
      notificationsCreated: notificationIds.length,
      delivered,
      failed,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const getBroadcastAudienceStats = async (req, res) => {
  try {
    const role = resolveRole(req);
    const adminId = String(req?.user?.id || "").trim();
    if (!adminId || role !== NOTIFICATION_ROLES.ADMIN) {
      return handleResponse(res, 403, "Only admin can access audience stats");
    }

    const [customers, sellers, delivery] = await Promise.all([
      User.countDocuments({
        role: { $in: ["user", "customer"] },
      }),
      Seller.countDocuments({}),
      Delivery.countDocuments({}),
    ]);

    const result = {
      all: Number(customers || 0) + Number(sellers || 0) + Number(delivery || 0),
      customers: Number(customers || 0),
      sellers: Number(sellers || 0),
      delivery: Number(delivery || 0),
    };

    return handleResponse(res, 200, "Audience stats fetched", result);
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
  broadcastNotification,
  getBroadcastAudienceStats,
};
