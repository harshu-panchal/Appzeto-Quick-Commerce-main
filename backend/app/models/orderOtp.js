import mongoose from "mongoose";
import crypto from "crypto";

const orderOtpSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    orderMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
    },
    codeHash: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    maxAttempts: {
      type: Number,
      default: 3,
    },
    lastGeneratedAt: {
      type: Date,
    },
    consumedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

orderOtpSchema.index({ orderId: 1, consumedAt: 1 });

orderOtpSchema.statics.hashCode = function (plain) {
  return crypto.createHash("sha256").update(String(plain)).digest("hex");
};

export default mongoose.model("OrderOtp", orderOtpSchema);
