/**
 * Background worker: Bull queue processors (timeouts).
 * Run alongside API in production, or as separate process: `node worker.js`
 */
import dotenv from "dotenv";
import connectDB from "./app/dbConfig/dbConfig.js";
import { registerOrderQueueProcessors } from "./app/queues/orderQueueProcessors.js";

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
