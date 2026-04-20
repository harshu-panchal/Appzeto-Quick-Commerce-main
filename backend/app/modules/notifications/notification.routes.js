import express from "express";
import { verifyToken } from "../../middleware/authMiddleware.js";
import {
  registerPushToken,
  removePushToken,
  getNotifications,
  markNotificationsRead,
  getNotificationPreferences,
  updateNotificationPreferences,
  testPushNotification,
  getTestPushNotificationStatus,
} from "./notification.controller.js";

const notificationRouter = express.Router();
notificationRouter.use(verifyToken);

// Required APIs
notificationRouter.get("/", getNotifications);
notificationRouter.patch("/read", markNotificationsRead);

// Backward compatibility
notificationRouter.put("/mark-all-read", markNotificationsRead);
notificationRouter.put("/:id/read", markNotificationsRead);
notificationRouter.patch("/read/:id", markNotificationsRead);

const pushRouter = express.Router();
pushRouter.use(verifyToken);
pushRouter.post("/register", registerPushToken);
pushRouter.delete("/remove", removePushToken);
pushRouter.post("/test", testPushNotification);
pushRouter.get("/test-status/:orderId", getTestPushNotificationStatus);
pushRouter.get("/preferences", getNotificationPreferences);
pushRouter.patch("/preferences", updateNotificationPreferences);

export { notificationRouter, pushRouter };
export default notificationRouter;
