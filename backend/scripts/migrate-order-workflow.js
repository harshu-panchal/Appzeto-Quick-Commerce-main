/**
 * Optional one-time migration: backfill workflowStatus for orders missing it.
 * Run: node scripts/migrate-order-workflow.js
 */
import dotenv from "dotenv";
import connectDB from "../app/dbConfig/dbConfig.js";
import Order from "../app/models/order.js";
import { workflowFromLegacyStatus } from "../app/constants/orderWorkflow.js";

dotenv.config();

async function run() {
  await connectDB();
  const cursor = Order.find({
    $or: [{ workflowStatus: { $exists: false } }, { workflowStatus: null }],
  }).cursor();

  let n = 0;
  for await (const doc of cursor) {
    doc.workflowStatus = workflowFromLegacyStatus(doc.status);
    if (!doc.workflowVersion) doc.workflowVersion = 1;
    await doc.save();
    n += 1;
  }
  console.log(`[migrate-order-workflow] Updated ${n} orders`);
  process.exit(0);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
