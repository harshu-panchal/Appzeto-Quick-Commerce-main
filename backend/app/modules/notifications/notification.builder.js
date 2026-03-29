import {
  NOTIFICATION_EVENTS,
  NOTIFICATION_ROLES,
  ROLE_TO_RECIPIENT_MODEL,
} from "./notification.constants.js";

function normalizeId(value) {
  if (!value) return null;
  if (typeof value === "object" && value._id) {
    return String(value._id);
  }
  return String(value);
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeId).filter(Boolean);
  }
  const single = normalizeId(value);
  return single ? [single] : [];
}

function getFrontendBaseUrl() {
  const explicit =
    process.env.FRONTEND_URL ||
    process.env.WEB_APP_URL ||
    "http://localhost:5173";
  return String(explicit).trim().replace(/\/+$/, "");
}

function buildOrderLink(orderId) {
  const id = String(orderId || "").trim();
  const baseUrl = getFrontendBaseUrl();
  if (!id) return `${baseUrl}/orders`;
  return `${baseUrl}/orders/${encodeURIComponent(id)}`;
}

function eventDefinition(eventType) {
  switch (eventType) {
    case NOTIFICATION_EVENTS.ORDER_PLACED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Placed",
        body: () => "Your order has been placed successfully.",
      };
    case NOTIFICATION_EVENTS.PAYMENT_SUCCESS:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Payment Successful",
        body: () => "Payment received for your order.",
      };
    case NOTIFICATION_EVENTS.ORDER_CONFIRMED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Confirmed",
        body: () => "Seller has confirmed your order.",
      };
    case NOTIFICATION_EVENTS.ORDER_PACKED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Packed",
        body: () => "Your order is packed and ready.",
      };
    case NOTIFICATION_EVENTS.OUT_FOR_DELIVERY:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Out For Delivery",
        body: () => "Your order is on the way.",
      };
    case NOTIFICATION_EVENTS.ORDER_DELIVERED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Order Delivered",
        body: () => "Your order has been delivered.",
      };
    case NOTIFICATION_EVENTS.ORDER_CANCELLED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: () => [],
        title: () => "Order Cancelled",
        body: () => "Your order has been cancelled.",
      };
    case NOTIFICATION_EVENTS.REFUND_INITIATED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Refund Initiated",
        body: () => "Refund has been initiated for your order.",
      };
    case NOTIFICATION_EVENTS.REFUND_COMPLETED:
      return {
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipientIds: (payload) => normalizeIdList(payload.userId || payload.customerId),
        title: () => "Refund Completed",
        body: () => "Refund has been completed.",
      };
    case NOTIFICATION_EVENTS.NEW_ORDER:
      return {
        role: NOTIFICATION_ROLES.SELLER,
        recipientIds: (payload) =>
          normalizeIdList(payload.sellerId || payload.sellerIds),
        title: () => "New Order",
        body: (payload) =>
          payload.orderId
            ? `New order #${payload.orderId} received.`
            : "You have received a new order.",
      };
    case NOTIFICATION_EVENTS.DELIVERY_ASSIGNED:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Delivery Assigned",
        body: (payload) =>
          payload.orderId
            ? `You have been assigned order #${payload.orderId}.`
            : "A new delivery has been assigned to you.",
      };
    case NOTIFICATION_EVENTS.ORDER_READY:
      return {
        role: NOTIFICATION_ROLES.DELIVERY,
        recipientIds: (payload) => normalizeIdList(payload.deliveryId),
        title: () => "Order Ready",
        body: (payload) =>
          payload.orderId
            ? `Order #${payload.orderId} is ready for pickup.`
            : "An order is ready for pickup.",
      };
    default:
      return null;
  }
}

function eventData(eventType, payload = {}) {
  const orderId = String(payload.orderId || "").trim() || undefined;
  const checkoutGroupId = String(payload.checkoutGroupId || "").trim() || undefined;
  return {
    eventType,
    orderId,
    checkoutGroupId,
    link: buildOrderLink(orderId),
    ...(payload.data || {}),
  };
}

export function buildNotification(eventType, payload = {}) {
  const definition = eventDefinition(eventType);
  if (!definition) return [];

  if (eventType === NOTIFICATION_EVENTS.ORDER_CANCELLED) {
    const customerIds = normalizeIdList(payload.userId || payload.customerId);
    const sellerIds = normalizeIdList(payload.sellerId || payload.sellerIds);
    const data = eventData(eventType, payload);
    const notifications = [];

    customerIds.forEach((recipientId) => {
      const body =
        payload.customerMessage || "Your order has been cancelled.";
      notifications.push({
        userId: recipientId,
        role: NOTIFICATION_ROLES.CUSTOMER,
        recipient: recipientId,
        recipientModel: ROLE_TO_RECIPIENT_MODEL[NOTIFICATION_ROLES.CUSTOMER],
        type: eventType,
        title: "Order Cancelled",
        body,
        message: body,
        data,
        channel: "push",
        provider: "fcm",
      });
    });

    sellerIds.forEach((recipientId) => {
      const body =
        payload.sellerMessage ||
        (payload.orderId
          ? `Order #${payload.orderId} has been cancelled.`
          : "An order has been cancelled.");
      notifications.push({
        userId: recipientId,
        role: NOTIFICATION_ROLES.SELLER,
        recipient: recipientId,
        recipientModel: ROLE_TO_RECIPIENT_MODEL[NOTIFICATION_ROLES.SELLER],
        type: eventType,
        title: "Order Cancelled",
        body,
        message: body,
        data,
        channel: "push",
        provider: "fcm",
      });
    });

    return notifications;
  }

  const recipientIds = definition.recipientIds(payload);
  if (!recipientIds.length) return [];

  const role = definition.role;
  const title = definition.title(payload);
  const body = definition.body(payload);
  const data = eventData(eventType, payload);

  return recipientIds.map((recipientId) => ({
    userId: recipientId,
    role,
    recipient: recipientId,
    recipientModel: ROLE_TO_RECIPIENT_MODEL[role],
    type: eventType,
    title,
    body,
    message: body,
    data,
    channel: "push",
    provider: "fcm",
  }));
}

export default {
  buildNotification,
};
