import mongoose from "mongoose";
import {
  ALL_LEDGER_DIRECTIONS,
  ALL_LEDGER_STATUSES,
  ALL_LEDGER_TRANSACTION_TYPES,
  ALL_OWNER_TYPES,
  ALL_PAYMENT_MODES,
  CURRENCY,
} from "../constants/finance.js";

const ledgerEntrySchema = new mongoose.Schema(
  {
    transactionId: {
      type: String,
      required: true,
      unique: true,
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
    walletId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Wallet",
      default: null,
      index: true,
    },
    actorType: {
      type: String,
      enum: ALL_OWNER_TYPES,
      required: true,
      index: true,
    },
    actorId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null,
      index: true,
    },
    type: {
      type: String,
      enum: ALL_LEDGER_TRANSACTION_TYPES,
      required: true,
      index: true,
    },
    direction: {
      type: String,
      enum: ALL_LEDGER_DIRECTIONS,
      required: true,
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
      enum: ALL_LEDGER_STATUSES,
      default: "COMPLETED",
      index: true,
    },
    paymentMode: {
      type: String,
      enum: ALL_PAYMENT_MODES,
      default: null,
      index: true,
    },
    balanceBefore: {
      type: Number,
      default: null,
    },
    balanceAfter: {
      type: Number,
      default: null,
    },
    metadata: {
      type: Object,
      default: {},
    },
    description: {
      type: String,
      trim: true,
    },
    reference: {
      type: String,
      trim: true,
      index: true,
    },
  },
  { timestamps: true },
);

ledgerEntrySchema.index({ createdAt: -1 });
ledgerEntrySchema.index({ actorType: 1, actorId: 1, createdAt: -1 });
ledgerEntrySchema.index({ orderId: 1, type: 1 });

export default mongoose.model("LedgerEntry", ledgerEntrySchema);
