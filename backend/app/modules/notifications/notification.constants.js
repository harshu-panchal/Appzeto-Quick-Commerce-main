export const NOTIFICATION_EVENTS = Object.freeze({
  ORDER_PLACED: "ORDER_PLACED",
  PAYMENT_SUCCESS: "PAYMENT_SUCCESS",
  ORDER_CONFIRMED: "ORDER_CONFIRMED",
  ORDER_PACKED: "ORDER_PACKED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  ORDER_DELIVERED: "ORDER_DELIVERED",
  ORDER_CANCELLED: "ORDER_CANCELLED",
  REFUND_INITIATED: "REFUND_INITIATED",
  REFUND_COMPLETED: "REFUND_COMPLETED",
  NEW_ORDER: "NEW_ORDER",
  DELIVERY_ASSIGNED: "DELIVERY_ASSIGNED",
  ORDER_READY: "ORDER_READY",
});

export const NOTIFICATION_ROLES = Object.freeze({
  CUSTOMER: "customer",
  SELLER: "seller",
  DELIVERY: "delivery",
  ADMIN: "admin",
});

export const ROLE_TO_USER_MODEL = Object.freeze({
  [NOTIFICATION_ROLES.CUSTOMER]: "User",
  [NOTIFICATION_ROLES.SELLER]: "Seller",
  [NOTIFICATION_ROLES.DELIVERY]: "Delivery",
  [NOTIFICATION_ROLES.ADMIN]: "Admin",
});

export const ROLE_TO_RECIPIENT_MODEL = Object.freeze({
  [NOTIFICATION_ROLES.CUSTOMER]: "Customer",
  [NOTIFICATION_ROLES.SELLER]: "Seller",
  [NOTIFICATION_ROLES.DELIVERY]: "Delivery",
  [NOTIFICATION_ROLES.ADMIN]: "Admin",
});

export const DEFAULT_DEDUP_TTL_SECONDS = () =>
  parseInt(process.env.NOTIFICATION_DEDUP_TTL_SEC || "86400", 10);

export const NOTIFICATION_QUEUE_ATTEMPTS = () =>
  parseInt(process.env.NOTIFICATION_QUEUE_ATTEMPTS || "3", 10);

export const NOTIFICATION_QUEUE_BACKOFF_MS = () =>
  parseInt(process.env.NOTIFICATION_QUEUE_BACKOFF_MS || "2000", 10);

export const NOTIFICATION_QUEUE_CONCURRENCY = () =>
  parseInt(process.env.NOTIFICATION_QUEUE_CONCURRENCY || "20", 10);

export const NOTIFICATION_QUEUE_JOB_TIMEOUT_MS = () =>
  parseInt(process.env.NOTIFICATION_QUEUE_JOB_TIMEOUT_MS || "30000", 10);

export const NOTIFICATIONS_ENABLED = () =>
  String(process.env.PUSH_NOTIFICATIONS_ENABLED || "true").toLowerCase() !== "false";

export const INVALID_FCM_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

export function normalizeNotificationRole(role) {
  const value = String(role || "").trim().toLowerCase();
  if (value === "user") return NOTIFICATION_ROLES.CUSTOMER;
  if (value === "customer") return NOTIFICATION_ROLES.CUSTOMER;
  if (value === "seller") return NOTIFICATION_ROLES.SELLER;
  if (value === "delivery") return NOTIFICATION_ROLES.DELIVERY;
  if (value === "admin") return NOTIFICATION_ROLES.ADMIN;
  return null;
}

export function roleFromRecipientModel(recipientModel) {
  const model = String(recipientModel || "").trim().toLowerCase();
  if (model === "user" || model === "customer") return NOTIFICATION_ROLES.CUSTOMER;
  if (model === "seller") return NOTIFICATION_ROLES.SELLER;
  if (model === "delivery") return NOTIFICATION_ROLES.DELIVERY;
  if (model === "admin") return NOTIFICATION_ROLES.ADMIN;
  return null;
}

export function roleFromEvent(eventType) {
  switch (eventType) {
    case NOTIFICATION_EVENTS.NEW_ORDER:
      return NOTIFICATION_ROLES.SELLER;
    case NOTIFICATION_EVENTS.DELIVERY_ASSIGNED:
    case NOTIFICATION_EVENTS.ORDER_READY:
      return NOTIFICATION_ROLES.DELIVERY;
    default:
      return NOTIFICATION_ROLES.CUSTOMER;
  }
}
