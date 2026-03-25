import dotenv from "dotenv";
import connectDB from "./app/dbConfig/dbConfig.js";
import startOrderAutoCancelJob from "./app/jobs/orderAutoCancelJob.js";

dotenv.config();

const start = async () => {
  await connectDB();
  startOrderAutoCancelJob();
};

start()
  .then(() => {
    console.log("[Worker] Started background jobs");
  })
  .catch((err) => {
    console.error("[Worker] Failed to start:", err);
    process.exit(1);
  });

