import { sellerTimeoutQueue, deliveryTimeoutQueue, JOB_NAMES } from "./orderQueues.js";
import {
  processSellerTimeoutJob,
  processDeliveryTimeoutJob,
} from "../services/orderWorkflowService.js";
import { isRedisEnabled } from "../config/redis.js";

export function registerOrderQueueProcessors() {
  if (!isRedisEnabled()) return;

  sellerTimeoutQueue.process(JOB_NAMES.SELLER_TIMEOUT, async (job) => {
    await processSellerTimeoutJob(job.data);
  });

  deliveryTimeoutQueue.process(JOB_NAMES.DELIVERY_TIMEOUT, async (job) => {
    await processDeliveryTimeoutJob(job.data);
  });

  sellerTimeoutQueue.on("failed", (job, err) => {
    console.error("[seller-timeout] failed", job?.id, err?.message);
  });
  deliveryTimeoutQueue.on("failed", (job, err) => {
    console.error("[delivery-timeout] failed", job?.id, err?.message);
  });
}
