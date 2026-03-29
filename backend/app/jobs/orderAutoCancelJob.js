import dotenv from "dotenv";
import Order from "../models/order.js";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { processSellerTimeoutJob, processDeliveryTimeoutJob } from "../services/orderWorkflowService.js";
import { compensateOrderCancellation } from "../services/orderCompensation.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";
import logger from "../services/logger.js";

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
  const startTime = Date.now();
  
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
        logger.error('v2 seller timeout failed', {
          jobName: 'orderAutoCancelJob',
          orderId: row.orderId,
          error: err.message
        });
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
        logger.error('v2 delivery timeout failed', {
          jobName: 'orderAutoCancelJob',
          orderId: row.orderId,
          error: err.message
        });
      }
    }

    const paymentExpiredOrders = await Order.find({
      workflowVersion: { $gte: 2 },
      workflowStatus: WORKFLOW_STATUS.CREATED,
      paymentMode: "ONLINE",
      paymentStatus: { $ne: "PAID" },
      "stockReservation.status": { $ne: "RELEASED" },
      "stockReservation.expiresAt": { $lte: now },
    })
      .select("_id orderId")
      .lean();

    for (const row of paymentExpiredOrders) {
      try {
        const updated = await Order.findOneAndUpdate(
          {
            _id: row._id,
            workflowStatus: WORKFLOW_STATUS.CREATED,
            paymentStatus: { $ne: "PAID" },
          },
          {
            $set: {
              workflowStatus: WORKFLOW_STATUS.CANCELLED,
              status: "cancelled",
              orderStatus: "cancelled",
              cancelledBy: "system",
              cancelReason: "Payment timeout",
            },
          },
          { new: true },
        );
        if (updated) {
          await compensateOrderCancellation(updated, updated.orderId);
          emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
            orderId: updated.orderId,
            customerId: updated.customer,
            userId: updated.customer,
            sellerId: updated.seller,
            customerMessage: "Order cancelled due to payment timeout.",
            sellerMessage: `Order #${updated.orderId} cancelled due to payment timeout.`,
          });
        }
      } catch (err) {
        logger.error('payment timeout cancellation failed', {
          jobName: 'orderAutoCancelJob',
          orderId: row.orderId,
          error: err.message
        });
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
        logger.error('legacy compensation failed', {
          jobName: 'orderAutoCancelJob',
          orderId: order.orderId,
          error: e.message
        });
      }

      emitNotificationEvent(NOTIFICATION_EVENTS.ORDER_CANCELLED, {
        orderId: order.orderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller,
        customerMessage:
          "Your order was cancelled because it was not accepted in time.",
        sellerMessage:
          `Order #${order.orderId} was cancelled because it was not accepted in time.`,
      });
    }

    const n =
      v2Expired.length +
      v2DeliveryExpired.length +
      paymentExpiredOrders.length +
      legacyExpired.length;
    
    const duration = Date.now() - startTime;
    
    if (n > 0) {
      logger.info('Order auto-cancel job completed', {
        jobName: 'orderAutoCancelJob',
        duration,
        v2SellerExpired: v2Expired.length,
        v2DeliveryExpired: v2DeliveryExpired.length,
        paymentExpired: paymentExpiredOrders.length,
        legacyExpired: legacyExpired.length,
        total: n
      });
    }
  } catch (err) {
    const duration = Date.now() - startTime;
    logger.error('Order auto-cancel job failed', {
      jobName: 'orderAutoCancelJob',
      duration,
      error: err.message,
      stack: err.stack
    });
  }
};

/**
 * Start order auto-cancel job using distributed scheduler
 * This function is called by the scheduler process role
 */
export const startOrderAutoCancelJob = () => {
  // This function is now a no-op - the distributed scheduler handles registration
  // Kept for backward compatibility
  logger.warn('startOrderAutoCancelJob called directly - use distributed scheduler instead');
};

/**
 * Get the job handler function for distributed scheduler registration
 * @returns {Function}
 */
export const getOrderAutoCancelJobHandler = () => autoCancelExpiredOrders;

/**
 * Get the job interval in milliseconds
 * @returns {number}
 */
export const getOrderAutoCancelJobInterval = () => AUTO_CANCEL_INTERVAL_MS;

export default startOrderAutoCancelJob;
