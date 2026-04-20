/** Persist order IDs for which the incoming-offer modal should never show again (accept/skip/view active order). */
export const HANDLED_INCOMING_ORDER_IDS_KEY = "deliveryHandledIncomingOrderIds";

export function loadHandledIncomingOrderIds() {
  try {
    const raw = sessionStorage.getItem(HANDLED_INCOMING_ORDER_IDS_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function markIncomingOrderHandled(orderId) {
  if (!orderId) return;
  try {
    const ids = loadHandledIncomingOrderIds();
    if (!ids.includes(orderId)) {
      ids.push(orderId);
      sessionStorage.setItem(HANDLED_INCOMING_ORDER_IDS_KEY, JSON.stringify(ids));
    }
  } catch {
    /* ignore */
  }
}
