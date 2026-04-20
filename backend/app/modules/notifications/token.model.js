import mongoose from "mongoose";
import {
  NOTIFICATION_ROLES,
  ROLE_TO_USER_MODEL,
} from "./notification.constants.js";

const tokenSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: Object.values(NOTIFICATION_ROLES),
      required: true,
      index: true,
    },
    userModel: {
      type: String,
      enum: Object.values(ROLE_TO_USER_MODEL),
      required: true,
    },
    token: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    platform: {
      type: String,
      enum: ["web", "app"],
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    invalidatedAt: {
      type: Date,
      default: null,
    },
    invalidReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

tokenSchema.index({ userId: 1, role: 1, isActive: 1, lastUsedAt: -1 });
tokenSchema.index({ userId: 1, role: 1, token: 1 }, { unique: true });

export default mongoose.models.PushToken || mongoose.model("PushToken", tokenSchema);
