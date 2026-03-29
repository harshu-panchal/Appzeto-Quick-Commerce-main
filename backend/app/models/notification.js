import mongoose from "mongoose";
import {
  NOTIFICATION_ROLES,
  NOTIFICATION_EVENTS,
} from "../modules/notifications/notification.constants.js";

const notificationSchema = new mongoose.Schema(
  {
    // New canonical fields (push + in-app unified log)
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(NOTIFICATION_ROLES),
      index: true,
    },
    body: {
      type: String,
      trim: true,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
      index: true,
    },
    sentAt: {
      type: Date,
      default: null,
      index: true,
    },
    failureReason: {
      type: String,
      default: "",
    },
    dedupeKey: {
      type: String,
      default: "",
      index: true,
    },
    channel: {
      type: String,
      enum: ["push", "in_app", "socket"],
      default: "push",
      index: true,
    },
    provider: {
      type: String,
      enum: ["fcm", "internal"],
      default: "fcm",
    },
    deliveryStats: {
      attempted: { type: Number, default: 0 },
      sent: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      invalidTokens: { type: Number, default: 0 },
    },
    // Existing compatibility fields
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "recipientModel",
      index: true,
    },
    recipientModel: {
      type: String,
      required: true,
      enum: ["Seller", "Admin", "Customer", "Delivery", "User"],
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: [
        ...Object.values(NOTIFICATION_EVENTS),
        "order",
        "payment",
        "alert",
        "system",
      ],
      default: "alert",
      index: true,
    },
    isRead: {
      type: Boolean,
      default: false,
      index: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true },
);

notificationSchema.pre("validate", function preValidate(next) {
  if (!this.userId && this.recipient) {
    this.userId = this.recipient;
  }
  if (!this.recipient && this.userId) {
    this.recipient = this.userId;
  }
  if (!this.body && this.message) {
    this.body = this.message;
  }
  if (!this.message && this.body) {
    this.message = this.body;
  }
  next();
});

notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ recipient: 1, recipientModel: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ recipient: 1, recipientModel: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, role: 1, createdAt: -1, _id: -1 });
notificationSchema.index({ userId: 1, role: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ role: 1, status: 1, createdAt: -1 });

export default mongoose.models.Notification || mongoose.model("Notification", notificationSchema);
