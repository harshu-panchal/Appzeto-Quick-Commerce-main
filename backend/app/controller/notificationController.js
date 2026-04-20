import {
  getNotifications,
  markNotificationsRead,
} from "../modules/notifications/notification.controller.js";

export const getMyNotifications = getNotifications;
export const markAsRead = markNotificationsRead;
export const markAllAsRead = markNotificationsRead;
