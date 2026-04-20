import mongoose from "mongoose";
import {
  ALL_ORDER_PAYMENT_STATUSES,
  ALL_PAYMENT_MODES,
  CURRENCY,
} from "../constants/finance.js";

const checkoutGroupSchema = new mongoose.Schema(
  {
    checkoutGroupId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: true,
      index: true,
    },
    orderIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Order",
      },
    ],
    publicOrderIds: [
      {
        type: String,
        trim: true,
      },
    ],
    paymentMode: {
      type: String,
      enum: ALL_PAYMENT_MODES,
      default: "COD",
      index: true,
    },
    paymentStatus: {
      type: String,
      enum: ALL_ORDER_PAYMENT_STATUSES,
      default: "CREATED",
      index: true,
    },
    status: {
      type: String,
      enum: ["CREATED", "PAYMENT_PENDING", "PAID", "CANCELLED", "EXPIRED", "FULFILLED"],
      default: "CREATED",
      index: true,
    },
    stockReservation: {
      status: {
        type: String,
        enum: ["RESERVED", "COMMITTED", "RELEASED"],
        default: "COMMITTED",
      },
      reservedAt: {
        type: Date,
        default: Date.now,
      },
      expiresAt: {
        type: Date,
        default: null,
      },
      releasedAt: {
        type: Date,
        default: null,
      },
    },
    pricingSummary: {
      currency: {
        type: String,
        default: CURRENCY,
      },
      productSubtotal: {
        type: Number,
        default: 0,
      },
      deliveryFeeCharged: {
        type: Number,
        default: 0,
      },
      handlingFeeCharged: {
        type: Number,
        default: 0,
      },
      tipTotal: {
        type: Number,
        default: 0,
      },
      discountTotal: {
        type: Number,
        default: 0,
      },
      taxTotal: {
        type: Number,
        default: 0,
      },
      grandTotal: {
        type: Number,
        default: 0,
      },
      walletAmount: {
        type: Number,
        default: 0,
      },
      sellerPayoutTotal: {
        type: Number,
        default: 0,
      },
      adminProductCommissionTotal: {
        type: Number,
        default: 0,
      },
      riderPayoutTotal: {
        type: Number,
        default: 0,
      },
      riderTipAmount: {
        type: Number,
        default: 0,
      },
      platformTotalEarning: {
        type: Number,
        default: 0,
      },
      snapshots: {
        type: Object,
        default: {},
      },
      lineItems: {
        type: Array,
        default: [],
      },
    },
    sellerBreakdown: [
      {
        seller: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Seller",
          required: true,
        },
        order: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Order",
          default: null,
        },
        publicOrderId: {
          type: String,
          default: null,
        },
        itemCount: {
          type: Number,
          default: 0,
        },
        subtotal: {
          type: Number,
          default: 0,
        },
        sellerPayout: {
          type: Number,
          default: 0,
        },
        riderTipAmount: {
          type: Number,
          default: 0,
        },
        adminCommission: {
          type: Number,
          default: 0,
        },
        grandTotal: {
          type: Number,
          default: 0,
        },
      },
    ],
    sellerCount: {
      type: Number,
      default: 1,
    },
    itemCount: {
      type: Number,
      default: 0,
    },
    addressSnapshot: {
      type: Object,
      default: {},
    },
    placement: {
      createdFrom: {
        type: String,
        enum: ["DIRECT_ITEMS", "CART"],
        default: "DIRECT_ITEMS",
      },
      idempotencyKey: {
        type: String,
        default: undefined,
      },
      idempotencyKeyExpiry: {
        type: Date,
        default: null,
      },
    },
    expiresAt: {
      type: Date,
      default: null,
      index: true,
    },
    metadata: {
      type: Object,
      default: {},
    },
  },
  { timestamps: true },
);

checkoutGroupSchema.index({ customer: 1, createdAt: -1 });
checkoutGroupSchema.index({ status: 1, createdAt: -1 });
checkoutGroupSchema.index({ paymentStatus: 1, createdAt: -1 });
checkoutGroupSchema.index({ checkoutGroupId: 1, createdAt: -1 });
checkoutGroupSchema.index(
  { customer: 1, "placement.idempotencyKey": 1 },
  {
    unique: true,
    partialFilterExpression: {
      "placement.idempotencyKey": { $type: "string" },
    },
  },
);
checkoutGroupSchema.index(
  { "placement.idempotencyKeyExpiry": 1 },
  {
    expireAfterSeconds: 0,
    partialFilterExpression: {
      "placement.idempotencyKeyExpiry": { $type: "date" },
    },
  },
);

export default mongoose.model("CheckoutGroup", checkoutGroupSchema);
