import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";

/**
 * Allowed transitions: [fromStatus] -> Set of toStatus (or event keys)
 */
const TRANSITIONS = {
  [WORKFLOW_STATUS.CREATED]: new Set([WORKFLOW_STATUS.SELLER_PENDING]),
  [WORKFLOW_STATUS.SELLER_PENDING]: new Set([
    WORKFLOW_STATUS.SELLER_ACCEPTED,
    WORKFLOW_STATUS.DELIVERY_SEARCH,
    WORKFLOW_STATUS.CANCELLED,
  ]),
  [WORKFLOW_STATUS.SELLER_ACCEPTED]: new Set([
    WORKFLOW_STATUS.DELIVERY_SEARCH,
    WORKFLOW_STATUS.CANCELLED,
  ]),
  [WORKFLOW_STATUS.DELIVERY_SEARCH]: new Set([
    WORKFLOW_STATUS.DELIVERY_ASSIGNED,
    WORKFLOW_STATUS.CANCELLED,
  ]),
  [WORKFLOW_STATUS.DELIVERY_ASSIGNED]: new Set([
    WORKFLOW_STATUS.PICKUP_READY,
    WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    WORKFLOW_STATUS.CANCELLED,
  ]),
  [WORKFLOW_STATUS.PICKUP_READY]: new Set([
    WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    WORKFLOW_STATUS.CANCELLED,
  ]),
  [WORKFLOW_STATUS.OUT_FOR_DELIVERY]: new Set([
    WORKFLOW_STATUS.DELIVERED,
    WORKFLOW_STATUS.CANCELLED,
  ]),
  [WORKFLOW_STATUS.DELIVERED]: new Set(),
  [WORKFLOW_STATUS.CANCELLED]: new Set(),
};

export function canTransition(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  const allowed = TRANSITIONS[from];
  return allowed ? allowed.has(to) : false;
}

export function assertTransition(from, to) {
  if (!canTransition(from, to)) {
    const err = new Error(`Invalid transition ${from} -> ${to}`);
    err.statusCode = 409;
    throw err;
  }
}

export { TRANSITIONS };
