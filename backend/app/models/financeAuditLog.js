import mongoose from "mongoose";
import { ALL_FINANCE_AUDIT_ACTIONS, ALL_OWNER_TYPES } from "../constants/finance.js";

const financeAuditLogSchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ALL_FINANCE_AUDIT_ACTIONS,
      required: true,
      index: true,
    },
    actorType: {
      type: String,
      enum: ALL_OWNER_TYPES,
      default: "ADMIN",
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      default: null,
      index: true,
    },
    payoutId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Payout",
      default: null,
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
    note: {
      type: String,
      trim: true,
    },
  },
  { timestamps: true },
);

financeAuditLogSchema.index({ createdAt: -1 });

export default mongoose.model("FinanceAuditLog", financeAuditLogSchema);
