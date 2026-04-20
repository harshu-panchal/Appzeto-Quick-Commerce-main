/**
 * Single source of truth for order status across customer, seller, delivery, and admin UIs.
 * Mirrors backend `legacyStatusFromWorkflow` (see backend/app/constants/orderWorkflow.js).
 */

export const WORKFLOW_STATUS = {
  CREATED: "CREATED",
  SELLER_PENDING: "SELLER_PENDING",
  SELLER_ACCEPTED: "SELLER_ACCEPTED",
  DELIVERY_SEARCH: "DELIVERY_SEARCH",
  DELIVERY_ASSIGNED: "DELIVERY_ASSIGNED",
  PICKUP_READY: "PICKUP_READY",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
};

const LEGACY_ENUM = new Set([
  "pending",
  "confirmed",
  "packed",
  "out_for_delivery",
  "delivered",
  "cancelled",
]);

function legacyFromWorkflow(workflowStatus) {
  switch (workflowStatus) {
    case WORKFLOW_STATUS.CREATED:
    case WORKFLOW_STATUS.SELLER_PENDING:
      return "pending";
    case WORKFLOW_STATUS.SELLER_ACCEPTED:
    case WORKFLOW_STATUS.DELIVERY_SEARCH:
      return "confirmed";
    case WORKFLOW_STATUS.DELIVERY_ASSIGNED:
    case WORKFLOW_STATUS.PICKUP_READY:
      return "confirmed";
    case WORKFLOW_STATUS.OUT_FOR_DELIVERY:
      return "out_for_delivery";
    case WORKFLOW_STATUS.DELIVERED:
      return "delivered";
    case WORKFLOW_STATUS.CANCELLED:
      return "cancelled";
    default:
      return "pending";
  }
}

/**
 * Normalized legacy bucket (matches Order.status enum + v2 workflow mapping).
 * Use for filters, tabs, and comparisons across panels.
 */
export function getLegacyStatusFromOrder(order) {
  if (!order) return "pending";
  const v = Number(order.workflowVersion) || 0;
  if (v >= 2 && order.workflowStatus) {
    const workflowStatus = String(order.workflowStatus).toUpperCase();

    if (workflowStatus === WORKFLOW_STATUS.OUT_FOR_DELIVERY) {
      return "out_for_delivery";
    }
    if (workflowStatus === WORKFLOW_STATUS.DELIVERED) {
      return "delivered";
    }
    if (
      workflowStatus === WORKFLOW_STATUS.DELIVERY_ASSIGNED ||
      workflowStatus === WORKFLOW_STATUS.PICKUP_READY
    ) {
      return "confirmed";
    }

    return legacyFromWorkflow(workflowStatus);
  }

  const riderStep = Number(order.deliveryRiderStep) || 0;
  if (riderStep >= 3 || order.outForDeliveryAt || order.pickupConfirmedAt) {
    return "out_for_delivery";
  }
  if (riderStep >= 1 || order.assignedAt || order.pickupReadyAt || order.deliveryBoy) {
    return "confirmed";
  }

  const s = String(order.status ?? "pending").toLowerCase();
  if (LEGACY_ENUM.has(s)) return s;
  return "pending";
}

const DISPLAY_LABELS = {
  pending: "Pending",
  confirmed: "Confirmed",
  packed: "Packed",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Human-readable status for list/detail badges (customer-facing tone). */
export function getOrderStatusLabel(order) {
  const rs = order?.returnStatus;
  if (rs && rs !== "none") {
    switch (rs) {
      case "return_requested": return "Return Requested";
      case "return_approved": return "Return Approved";
      case "return_pickup_assigned": return "Pickup Assigned";
      case "return_pickup_verified": return "Pickup Verified";
      case "returned": return "Return Delivered to Seller";
      case "qc_passed": return "Return QC Passed";
      case "qc_failed": return "Return QC Failed";
      case "refund_completed": return "Returned & Refunded";
      default: return rs.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
    }
  }

  const bucket = getLegacyStatusFromOrder(order);
  return DISPLAY_LABELS[bucket] || bucket.replace(/_/g, " ");
}

/**
 * Admin sidebar uses path segments like `processed` and `out-for-delivery`.
 * Map route param → whether an order belongs in that view.
 */
export function adminRouteMatchesOrder(routeStatus, order) {
  const legacy = getLegacyStatusFromOrder(order);
  if (routeStatus === "all") return true;
  if (routeStatus === "pending") return legacy === "pending";
  if (routeStatus === "processed") {
    return legacy === "confirmed" || legacy === "packed";
  }
  if (routeStatus === "out-for-delivery") {
    return legacy === "out_for_delivery";
  }
  if (routeStatus === "delivered") return legacy === "delivered";
  if (routeStatus === "cancelled") return legacy === "cancelled";
  if (routeStatus === "returned") {
    const rs = order?.returnStatus;
    return rs && rs !== "none";
  }
  return legacy === routeStatus;
}
