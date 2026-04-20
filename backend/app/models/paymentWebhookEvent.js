import mongoose from "mongoose";
import { ALL_PAYMENT_GATEWAYS } from "../constants/payment.js";

const paymentWebhookEventSchema = new mongoose.Schema(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    gatewayName: {
      type: String,
      enum: ALL_PAYMENT_GATEWAYS,
      required: true,
      default: "PHONEPE",
    },
    eventType: {
      type: String,
      required: true,
    },
    payment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payment",
      default: null,
      index: true,
    },
    publicOrderId: {
      type: String,
      default: null,
      index: true,
    },
    payloadHash: {
      type: String,
      required: true,
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

paymentWebhookEventSchema.index({ gatewayName: 1, processedAt: -1 });

export default mongoose.model("PaymentWebhookEvent", paymentWebhookEventSchema);