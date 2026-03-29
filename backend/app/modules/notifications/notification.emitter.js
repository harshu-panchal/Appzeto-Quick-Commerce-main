import logger from "../../services/logger.js";

export function emitNotificationEvent(eventType, payload = {}) {
  if (process.env.NODE_ENV === "test") {
    return;
  }
  setImmediate(async () => {
    try {
      const { notify } = await import("./notification.service.js");
      await notify(eventType, payload);
    } catch (error) {
      logger.error("Failed to emit notification event", {
        eventType,
        message: error.message,
      });
    }
  });
}

export default {
  emitNotificationEvent,
};
