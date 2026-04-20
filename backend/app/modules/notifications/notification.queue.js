import Bull from "bull";
import {
  getRedisOptionsForBull,
  isRedisEnabled,
  createBullRedisClient,
} from "../../config/redis.js";
import {
  NOTIFICATION_QUEUE_ATTEMPTS,
  NOTIFICATION_QUEUE_BACKOFF_MS,
} from "./notification.constants.js";

const redisOpts = getRedisOptionsForBull();

function createNoopQueue(name) {
  return {
    name,
    add: async () => ({}),
    getJob: async () => null,
    process: () => {},
    on: () => {},
    close: async () => {},
    pause: async () => {},
    getActive: async () => [],
    getWaitingCount: async () => 0,
    getActiveCount: async () => 0,
    getCompletedCount: async () => 0,
    getFailedCount: async () => 0,
    getDelayedCount: async () => 0,
    isReady: async () => true,
  };
}

const queueSettings = {
  stalledInterval: parseInt(process.env.BULL_STALLED_INTERVAL || "30000", 10),
  maxStalledCount: parseInt(process.env.BULL_MAX_STALLED_COUNT || "2", 10),
};

const defaultJobOptions = {
  attempts: NOTIFICATION_QUEUE_ATTEMPTS(),
  backoff: {
    type: "exponential",
    delay: NOTIFICATION_QUEUE_BACKOFF_MS(),
  },
  removeOnComplete: true,
  removeOnFail: false,
};

export const notificationQueue = isRedisEnabled()
  ? new Bull("notifications", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
      defaultJobOptions,
    })
  : createNoopQueue("notifications");

export const notificationDeadQueue = isRedisEnabled()
  ? new Bull("notifications-dead", {
      redis: redisOpts,
      createClient: createBullRedisClient,
      settings: queueSettings,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
      },
    })
  : createNoopQueue("notifications-dead");

export const NOTIFICATION_JOB_NAMES = Object.freeze({
  SEND: "send-notification",
  DEAD_LETTER: "dead-notification",
});

export async function getNotificationQueueStats() {
  const [waiting, active, completed, failed, delayed] = await Promise.all([
    notificationQueue.getWaitingCount(),
    notificationQueue.getActiveCount(),
    notificationQueue.getCompletedCount(),
    notificationQueue.getFailedCount(),
    notificationQueue.getDelayedCount(),
  ]);

  return {
    waiting,
    active,
    completed,
    failed,
    delayed,
    size: waiting + active + delayed,
  };
}
