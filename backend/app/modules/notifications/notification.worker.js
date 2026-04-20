import Notification from "./notification.model.js";
import PushToken from "./token.model.js";
import {
  notificationQueue,
  notificationDeadQueue,
  NOTIFICATION_JOB_NAMES,
  getNotificationQueueStats,
} from "./notification.queue.js";
import { sendFCM } from "./firebase.service.js";
import {
  INVALID_FCM_TOKEN_CODES,
  NOTIFICATION_QUEUE_CONCURRENCY,
  NOTIFICATION_QUEUE_JOB_TIMEOUT_MS,
} from "./notification.constants.js";
import { isRedisEnabled } from "../../config/redis.js";
import logger from "../../services/logger.js";
import {
  incrementCounter,
  recordHistogram,
  setGauge,
} from "../../services/metrics.js";

function failedCodeOf(responseItem) {
  return String(responseItem?.error?.code || "").trim();
}

function shouldRetryForResponses(responses = []) {
  if (!responses.length) return true;
  for (const response of responses) {
    if (response?.success) return false;
    const code = failedCodeOf(response);
    if (!INVALID_FCM_TOKEN_CODES.has(code)) {
      return true;
    }
  }
  return false;
}

async function refreshQueueMetrics() {
  try {
    const stats = await getNotificationQueueStats();
    setGauge("notifications_queue_size", Number(stats.size || 0));
    setGauge("notifications_queue_waiting", Number(stats.waiting || 0));
    setGauge("notifications_queue_active", Number(stats.active || 0));
    setGauge("notifications_queue_failed", Number(stats.failed || 0));
  } catch (error) {
    logger.debug("Notification queue metrics refresh failed", {
      message: error.message,
    });
  }
}

async function deactivateInvalidTokens(tokens = [], responses = []) {
  const invalidTokenIds = [];

  responses.forEach((response, index) => {
    if (response?.success) return;
    const code = failedCodeOf(response);
    if (!INVALID_FCM_TOKEN_CODES.has(code)) return;
    const tokenDoc = tokens[index];
    if (tokenDoc?._id) {
      invalidTokenIds.push(tokenDoc._id);
    }
  });

  if (!invalidTokenIds.length) {
    return 0;
  }

  await PushToken.updateMany(
    { _id: { $in: invalidTokenIds } },
    {
      $set: {
        isActive: false,
        invalidReason: "FCM_TOKEN_INVALID",
        invalidatedAt: new Date(),
        lastUsedAt: new Date(),
      },
    },
  );

  incrementCounter("notifications_invalid_tokens_total", {}, invalidTokenIds.length);
  return invalidTokenIds.length;
}

export async function deliverNotificationById(notificationId) {
  if (!notificationId) {
    return;
  }

  const notification = await Notification.findById(notificationId);
  if (!notification) {
    return;
  }

  const tokens = await PushToken.find({
    userId: notification.userId,
    role: notification.role,
    isActive: true,
  })
    .sort({ lastUsedAt: -1 })
    .lean();

  if (!tokens.length) {
    await Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          status: "failed",
          failureReason: "No active push tokens for user",
          deliveryStats: {
            attempted: 0,
            sent: 0,
            failed: 0,
            invalidTokens: 0,
          },
        },
      },
    );
    incrementCounter("notifications_total", {
      status: "failed",
      eventType: notification.type,
      role: notification.role,
    });
    return;
  }

  let fcmResponse;
  try {
    fcmResponse = await Promise.race([
      sendFCM(
        tokens.map((tokenDoc) => tokenDoc.token),
        {
          title: notification.title,
          body: notification.body || notification.message,
          message: notification.message,
          data: notification.data || {},
        },
      ),
      new Promise((_, reject) =>
        setTimeout(
          () => reject(new Error("FCM send timeout")),
          NOTIFICATION_QUEUE_JOB_TIMEOUT_MS(),
        ),
      ),
    ]);
  } catch (error) {
    await Notification.updateOne(
      { _id: notification._id },
      {
        $set: {
          status: "failed",
          failureReason: error.message,
        },
      },
    );
    incrementCounter("notifications_total", {
      status: "failed",
      eventType: notification.type,
      role: notification.role,
    });
    throw error;
  }

  const attempted = Number(tokens.length || 0);
  const sent = Number(fcmResponse?.successCount || 0);
  const failed = Number(fcmResponse?.failureCount || 0);
  const responses = fcmResponse?.responses || [];
  const invalidTokens = await deactivateInvalidTokens(tokens, responses);
  const status = sent > 0 ? "sent" : "failed";
  const update = {
    status,
    failureReason: status === "failed" ? "Failed to deliver notification" : "",
    deliveryStats: {
      attempted,
      sent,
      failed,
      invalidTokens,
    },
  };
  if (status === "sent") {
    update.sentAt = new Date();
  }

  await Notification.updateOne({ _id: notification._id }, { $set: update });
  incrementCounter("notifications_total", {
    status,
    eventType: notification.type,
    role: notification.role,
  });

  if (sent === 0 && shouldRetryForResponses(responses)) {
    throw new Error("All notification sends failed");
  }
}

export async function processNotificationJob(job) {
  const { notificationId } = job.data || {};
  await deliverNotificationById(notificationId);
}

export function registerNotificationQueueProcessors() {
  if (!isRedisEnabled()) {
    logger.info("Redis disabled, skipping notification queue processor registration");
    return;
  }

  notificationQueue.process(
    NOTIFICATION_JOB_NAMES.SEND,
    NOTIFICATION_QUEUE_CONCURRENCY(),
    async (job) => {
      const startTime = Date.now();
      try {
        await processNotificationJob(job);
        incrementCounter("queue_jobs_total", {
          queue: "notifications",
          status: "completed",
        });
        recordHistogram("queue_job_duration_seconds", (Date.now() - startTime) / 1000, {
          queue: "notifications",
        });
      } catch (error) {
        incrementCounter("queue_jobs_total", {
          queue: "notifications",
          status: "failed",
        });
        recordHistogram("queue_job_duration_seconds", (Date.now() - startTime) / 1000, {
          queue: "notifications",
        });
        throw error;
      } finally {
        await refreshQueueMetrics();
      }
    },
  );

  notificationQueue.on("failed", async (job, err) => {
    logger.error("Notification queue job failed", {
      queue: "notifications",
      jobId: job?.id,
      attemptsMade: job?.attemptsMade,
      error: err?.message,
    });

    const attempts = Number(job?.opts?.attempts || 1);
    if (Number(job?.attemptsMade || 0) >= attempts) {
      try {
        await notificationDeadQueue.add(
          NOTIFICATION_JOB_NAMES.DEAD_LETTER,
          {
            failedJobId: job?.id,
            originalData: job?.data || {},
            error: err?.message || "Unknown error",
            failedAt: new Date().toISOString(),
          },
          {
            removeOnComplete: true,
            removeOnFail: false,
          },
        );
      } catch (deadError) {
        logger.error("Failed to enqueue dead-letter notification job", {
          message: deadError.message,
        });
      }
    }
  });

  notificationQueue.on("completed", (job) => {
    logger.debug("Notification queue job completed", {
      queue: "notifications",
      jobId: job?.id,
    });
  });

  logger.info("Notification queue processors registered", {
    queue: "notifications",
    deadQueue: "notifications-dead",
    concurrency: NOTIFICATION_QUEUE_CONCURRENCY(),
  });
}

export default {
  deliverNotificationById,
  registerNotificationQueueProcessors,
};
