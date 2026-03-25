import dotenv from "dotenv";
import Order from "../models/order.js";
import Notification from "../models/notification.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { processSellerTimeoutJob, processDeliveryTimeoutJob } from "../services/orderWorkflowService.js";
import { compensateOrderCancellation } from "../services/orderCompensation.js";

dotenv.config();

const DEFAULT_INTERVAL_MS = 10000;
const AUTO_CANCEL_INTERVAL_MS = parseInt(
  process.env.AUTO_CANCEL_INTERVAL_MS || `${DEFAULT_INTERVAL_MS}`,
  10,
);

/**
 * Fallback when Bull/Redis is unavailable: reconciles expired seller-pending orders (v2)
 * by delegating to the same handler as the queue worker.
 * Legacy v1 orders use status + expiresAt only.
 */
const autoCancelExpiredOrders = async () => {
  try {
    const now = new Date();

    const v2Expired = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.SELLER_PENDING,
      sellerPendingExpiresAt: { $lte: now },
    })
      .select("orderId")
      .lean();

    for (const row of v2Expired) {
      try {
        await processSellerTimeoutJob({ orderId: row.orderId });
      } catch (err) {
        console.error(
          "[OrderAutoCancelJob] v2 seller timeout failed",
          row.orderId,
          err.message,
        );
      }
    }

    const v2DeliveryExpired = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.DELIVERY_SEARCH,
      deliverySearchExpiresAt: { $lte: now },
    })
      .select("orderId deliverySearchMeta")
      .lean();

    for (const row of v2DeliveryExpired) {
      try {
        const attempt = row.deliverySearchMeta?.attempt || 1;
        await processDeliveryTimeoutJob({ orderId: row.orderId, attempt });
      } catch (err) {
        console.error(
          "[OrderAutoCancelJob] v2 delivery timeout failed",
          row.orderId,
          err.message,
        );
      }
    }

    const legacyExpired = await Order.find({
      $or: [
        { workflowVersion: { $exists: false } },
        { workflowVersion: { $lt: 2 } },
      ],
      status: "pending",
      expiresAt: { $lte: now },
    });

    for (const order of legacyExpired) {
      order.status = "cancelled";
      order.cancelledBy = "system";
      order.cancelReason = "Seller timeout (60s)";
      await order.save();

      try {
        await compensateOrderCancellation(order, order.orderId);
      } catch (e) {
        console.error(
          "[OrderAutoCancelJob] legacy compensation failed",
          order.orderId,
          e.message,
        );
      }

      if (order.seller) {
        await Notification.create({
          recipient: order.seller,
          recipientModel: "Seller",
          title: "Order Timed Out",
          message: `Order #${order.orderId} was cancelled because it wasn't accepted within 60 seconds.`,
          type: "order",
          data: { orderId: order.orderId, mongoOrderId: order._id },
        });
      }
    }

    const n = v2Expired.length + v2DeliveryExpired.length + legacyExpired.length;
    if (n > 0) {
      console.log(
        `[OrderAutoCancelJob] Processed ${v2Expired.length} v2 seller + ${v2DeliveryExpired.length} v2 delivery + ${legacyExpired.length} legacy expired orders at ${now.toISOString()}`,
      );
    }
  } catch (err) {
    console.error("[OrderAutoCancelJob] Error:", err);
  }
};

export const startOrderAutoCancelJob = () => {
  if (globalThis.__ORDER_AUTO_CANCEL_STARTED__) {
    return;
  }
  globalThis.__ORDER_AUTO_CANCEL_STARTED__ = true;

  console.log(
    `[OrderAutoCancelJob] Starting auto-cancel job with interval ${AUTO_CANCEL_INTERVAL_MS}ms (v2 + legacy fallback)`,
  );

  setInterval(autoCancelExpiredOrders, AUTO_CANCEL_INTERVAL_MS);
  void autoCancelExpiredOrders();
};

export default startOrderAutoCancelJob;
