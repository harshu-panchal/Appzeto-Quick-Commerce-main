/**
 * Background worker: Bull queue processors (timeouts).
 * Run alongside API in production, or as separate process: `node worker.js`
 */
import dotenv from "dotenv";
import connectDB from "./app/dbConfig/dbConfig.js";
import { registerOrderQueueProcessors } from "./app/queues/orderQueueProcessors.js";
import mongoose from "mongoose";
import { deliveryTimeoutQueue, sellerTimeoutQueue } from "./app/queues/orderQueues.js";
import { getRedisClient } from "./app/config/redis.js";

dotenv.config();

async function start() {
  await connectDB();
  registerOrderQueueProcessors();
  console.log("[Worker] Order queue processors registered (seller-timeout, delivery-timeout)");
}

start().catch((err) => {
  console.error("[Worker] Failed to start:", err);
  process.exit(1);
});

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[Worker] Graceful shutdown triggered by ${signal}`);

  try {
    await Promise.allSettled([
      sellerTimeoutQueue.close(),
      deliveryTimeoutQueue.close(),
    ]);
    const redis = getRedisClient();
    if (redis) {
      await redis.quit().catch(() => redis.disconnect());
    }
    if (mongoose.connection.readyState !== 0) {
      await mongoose.connection.close(false);
    }
    process.exit(0);
  } catch (error) {
    console.error("[Worker] Shutdown error:", error);
    process.exit(1);
  }
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
