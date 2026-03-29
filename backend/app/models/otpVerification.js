import mongoose from "mongoose";

const otpVerificationSchema = new mongoose.Schema(
  {
    purpose: {
      type: String,
      required: true,
      trim: true,
    },
    channel: {
      type: String,
      enum: ["email", "phone"],
      required: true,
    },
    target: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    otpHash: {
      type: String,
      required: true,
      select: false,
    },
    expiresAt: {
      type: Date,
      required: true,
      select: false,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    failedAttempts: {
      type: Number,
      default: 0,
    },
    lastSentAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

otpVerificationSchema.index(
  { purpose: 1, channel: 1, target: 1 },
  { unique: true, name: "purpose_channel_target_unique" },
);
otpVerificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0, name: "expires_at_ttl" },
);

export default mongoose.model("OtpVerification", otpVerificationSchema);
