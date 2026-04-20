import mongoose from "mongoose";
import { ALL_PAYOUT_STATUSES, ALL_PAYOUT_TYPES, CURRENCY } from "../constants/finance.js";

const payoutSchema = new mongoose.Schema(
  {
    payoutType: {
      type: String,
      enum: ALL_PAYOUT_TYPES,
      required: true,
      index: true,
    },
    beneficiaryId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: CURRENCY,
      uppercase: true,
      trim: true,
    },
    status: {
      type: String,
      enum: ALL_PAYOUT_STATUSES,
      default: "PENDING",
      index: true,
    },
    relatedOrderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      default: null,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    remarks: {
      type: String,
      trim: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
    },
    failedReason: {
      type: String,
      trim: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

payoutSchema.index({ beneficiaryId: 1, payoutType: 1, status: 1 });
payoutSchema.index({ relatedOrderIds: 1 });

export default mongoose.model("Payout", payoutSchema);
