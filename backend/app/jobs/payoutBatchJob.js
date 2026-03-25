import { bulkProcessPayouts } from "../services/finance/payoutService.js";

const PAYOUT_BATCH_INTERVAL_MS = () =>
  parseInt(process.env.PAYOUT_BATCH_INTERVAL_MS || "900000", 10);

export default function startPayoutBatchJob() {
  if (process.env.ENABLE_PAYOUT_BATCH_JOB !== "true") {
    return;
  }

  const tick = async () => {
    try {
      const result = await bulkProcessPayouts({
        limit: parseInt(process.env.PAYOUT_BATCH_LIMIT || "25", 10),
        remarks: "Auto-batch payout job",
      });
      if (result.completed > 0 || result.failed > 0) {
        console.log(
          `[PayoutBatchJob] completed=${result.completed} failed=${result.failed} total=${result.total}`,
        );
      }
    } catch (error) {
      console.error("[PayoutBatchJob] failed:", error.message);
    }
  };

  setInterval(tick, PAYOUT_BATCH_INTERVAL_MS());
  console.log(
    `[PayoutBatchJob] started interval=${PAYOUT_BATCH_INTERVAL_MS()}ms`,
  );
}
