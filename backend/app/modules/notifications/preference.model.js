import mongoose from "mongoose";
import { NOTIFICATION_ROLES } from "./notification.constants.js";

const preferenceSchema = new mongoose.Schema(
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
    orderUpdates: {
      type: Boolean,
      default: true,
    },
    deliveryUpdates: {
      type: Boolean,
      default: true,
    },
    promotions: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

preferenceSchema.index({ userId: 1, role: 1 }, { unique: true });

export default mongoose.models.NotificationPreference ||
  mongoose.model("NotificationPreference", preferenceSchema);
