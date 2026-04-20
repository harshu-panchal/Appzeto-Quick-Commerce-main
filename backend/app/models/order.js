import mongoose from "mongoose";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import {
  ALL_ORDER_PAYMENT_STATUSES,
  ALL_ORDER_SETTLEMENT_STATUSES,
  ALL_PAYMENT_MODES,
  CURRENCY,
} from "../constants/finance.js";

const orderSchema = new mongoose.Schema(
  {
    orderId: {
      type: String,
      required: true,
      unique: true,
    },
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    seller: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
    },
    items: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: String,
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        variantSlot: String,
        image: String,
      },
    ],
    address: {
      type: {
        type: String,
        enum: ["Home", "Work", "Other"],
        default: "Home",
      },
      name: String,
      address: String,
      city: String,
      phone: String,
      landmark: String,
      location: {
        lat: Number,
        lng: Number,
      },
    },
    payment: {
      method: {
        type: String,
        enum: ["cash", "online", "wallet"],
        default: "cash",
      },
      status: {
        type: String,
        enum: ["pending", "completed", "failed", "refunded"],
        default: "pending",
      },
      transactionId: String,
    },
    pricing: {
      subtotal: Number,
      deliveryFee: Number,
      platformFee: Number,
      gst: Number,
      tip: {
        type: Number,
        default: 0,
      },
      discount: {
        type: Number,
        default: 0,
      },
      total: Number,
      walletAmount: {
        type: Number,
        default: 0,
      },
    },
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
    stockReservation: {
      status: {
        type: String,
        enum: ["RESERVED", "COMMITTED", "RELEASED"],
        default: "COMMITTED",
        index: true,
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
    checkoutGroupId: {
      type: String,
      index: true,
      default: null,
    },
    checkoutGroupSize: {
      type: Number,
      default: 1,
    },
    checkoutGroupIndex: {
      type: Number,
      default: 0,
    },
    placement: {
      idempotencyKey: {
        type: String,
        default: undefined,
      },
      idempotencyKeyExpiry: {
        type: Date,
        default: null,
      },
      createdFrom: {
        type: String,
        enum: ["DIRECT_ITEMS", "CART"],
        default: "DIRECT_ITEMS",
      },
    },
    orderStatus: {
      type: String,
      default: "pending",
      index: true,
    },
    settlementStatus: {
      overall: {
        type: String,
        enum: ALL_ORDER_SETTLEMENT_STATUSES,
        default: "PENDING",
      },
      sellerPayout: {
        type: String,
        enum: ["NOT_APPLICABLE", "HOLD", "PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED"],
        default: "PENDING",
      },
      riderPayout: {
        type: String,
        enum: ["NOT_APPLICABLE", "PENDING", "PROCESSING", "COMPLETED", "FAILED"],
        default: "PENDING",
      },
      adminEarningCredited: {
        type: Boolean,
        default: false,
      },
      reconciledAt: {
        type: Date,
        default: null,
      },
    },
    distanceSnapshot: {
      distanceKmActual: { type: Number, default: 0 },
      distanceKmRounded: { type: Number, default: 0 },
      source: { type: String, default: "haversine" },
    },
    pricingSnapshot: {
      deliverySettings: {
        type: Object,
        default: {},
      },
      handlingFeeStrategy: {
        type: String,
        default: null,
      },
      handlingCategoryUsed: {
        type: Object,
        default: {},
      },
      categoryCommissionSettings: {
        type: Array,
        default: [],
      },
    },
    paymentBreakdown: {
      currency: { type: String, default: CURRENCY },
      productSubtotal: { type: Number, default: 0 },
      deliveryFeeCharged: { type: Number, default: 0 },
      handlingFeeCharged: { type: Number, default: 0 },
      tipTotal: { type: Number, default: 0 },
      discountTotal: { type: Number, default: 0 },
      taxTotal: { type: Number, default: 0 },
      grandTotal: { type: Number, default: 0 },
      sellerPayoutTotal: { type: Number, default: 0 },
      adminProductCommissionTotal: { type: Number, default: 0 },
      riderPayoutBase: { type: Number, default: 0 },
      riderPayoutDistance: { type: Number, default: 0 },
      riderPayoutBonus: { type: Number, default: 0 },
      riderTipAmount: { type: Number, default: 0 },
      riderPayoutTotal: { type: Number, default: 0 },
      platformLogisticsMargin: { type: Number, default: 0 },
      platformTotalEarning: { type: Number, default: 0 },
      codCollectedAmount: { type: Number, default: 0 },
      codRemittedAmount: { type: Number, default: 0 },
      codPendingAmount: { type: Number, default: 0 },
      walletAmount: { type: Number, default: 0 },
      distanceKmActual: { type: Number, default: 0 },
      distanceKmRounded: { type: Number, default: 0 },
      snapshots: {
        deliverySettings: { type: Object, default: {} },
        categoryCommissionSettings: { type: Array, default: [] },
        handlingFeeStrategy: { type: String, default: null },
        handlingCategoryUsed: { type: Object, default: {} },
      },
      lineItems: {
        type: Array,
        default: [],
      },
    },
    financeFlags: {
      onlinePaymentCaptured: { type: Boolean, default: false },
      codMarkedCollected: { type: Boolean, default: false },
      deliveredSettlementApplied: { type: Boolean, default: false },
      sellerPayoutQueued: { type: Boolean, default: false },
      riderPayoutQueued: { type: Boolean, default: false },
      adminEarningCredited: { type: Boolean, default: false },
    },
    status: {
      type: String,
      enum: [
        "pending",
        "confirmed",
        "packed",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      default: "pending",
    },
    workflowStatus: {
      type: String,
      enum: Object.values(WORKFLOW_STATUS),
    },
    workflowVersion: {
      type: Number,
      default: 1,
    },
    sellerPendingExpiresAt: Date,
    deliverySearchExpiresAt: Date,
    sellerAcceptedAt: Date,
    assignedAt: Date,
    assignmentVersion: {
      type: Number,
      default: 0,
    },
    deliverySearchMeta: {
      radiusMeters: { type: Number, default: 5000 },
      attempt: { type: Number, default: 1 },
      lastBroadcastAt: Date,
    },
    pickupConfirmedAt: Date,
    pickupReadyAt: Date,
    outForDeliveryAt: Date,
    deliveryRiderStep: {
      type: Number,
      min: 1,
      max: 4,
    },
    timeSlot: {
      type: String,
      default: "now",
    },
    deliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    deliveryPartner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    cancelledBy: {
      type: String,
      enum: ["customer", "seller", "admin", "system"],
    },
    cancelReason: String,
    deviceType: {
      type: String,
      enum: ["Mobile", "Desktop", "Tablet"],
      default: "Mobile",
    },
    trafficSource: {
      type: String,
      enum: ["Direct", "Search", "Social", "Referral"],
      default: "Direct",
    },
    expiresAt: {
      type: Date,
    },
    acceptedAt: {
      type: Date,
    },
    deliveredAt: {
      type: Date,
    },
    skippedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Delivery",
      },
    ],
    returnStatus: {
      type: String,
      enum: [
        "none",
        "return_requested",
        "return_approved",
        "return_rejected",
        "return_pickup_assigned",
        "return_in_transit",
        "return_drop_pending",
        "returned",
        "qc_passed",
        "qc_failed",
        "refund_completed",
      ],
      default: "none",
    },
    returnRequestedAt: {
      type: Date,
    },
    returnEligibleAt: {
      type: Date,
    },
    returnWindowExpiresAt: {
      type: Date,
    },
    returnDeadline: {
      type: Date,
    },
    returnReason: {
      type: String,
    },
    returnReasonDetail: {
      type: String,
    },
    returnConditionAssurance: {
      type: Boolean,
      default: false,
    },
    returnImages: [{ type: String }],
    returnItems: [
      {
        product: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        name: String,
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        price: {
          type: Number,
          required: true,
        },
        variantSlot: String,
        itemIndex: {
          type: Number,
        },
        status: {
          type: String,
          enum: ["requested", "approved", "rejected", "returned"],
          default: "requested",
        },
      },
    ],
    returnRejectedReason: {
      type: String,
    },
    returnDeliveryBoy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    returnDeliveryCommission: {
      type: Number,
      default: 0,
    },
    returnRefundAmount: {
      type: Number,
      default: 0,
    },
    returnPickedAt: {
      type: Date,
    },
    returnDeliveredBackAt: {
      type: Date,
    },
    returnQcStatus: {
      type: String,
      enum: ["passed", "failed"],
    },
    returnQcAt: {
      type: Date,
    },
    returnQcBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
    },
    returnQcNote: {
      type: String,
    },
    returnPickupImages: [{ type: String }],
    returnPickupCondition: {
      type: String,
      enum: ["good", "damaged", "suspicious"],
    },
    returnPickupConditionNote: { type: String },
    returnDropVerifiedAt: { type: Date },
    returnDropVerifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    refundIssuedAt: { type: Date },
    sellerPayoutReleasedAt: { type: Date },
    deliveryProofImages: [{ type: String }],
    otpValidatedAt: {
      type: Date,
    },
    otpValidationLocation: {
      lat: Number,
      lng: Number,
    },
  },
  { timestamps: true },
);

orderSchema.index({ status: 1, seller: 1, deliveryBoy: 1, createdAt: -1 });
orderSchema.index({ customer: 1, status: 1, createdAt: -1 });
orderSchema.index({ status: 1, expiresAt: 1 });
orderSchema.index({ seller: 1, returnStatus: 1, returnRequestedAt: -1 });
orderSchema.index({ workflowStatus: 1, sellerPendingExpiresAt: 1 });
orderSchema.index({ workflowStatus: 1, deliverySearchExpiresAt: 1 });
orderSchema.index({ deliveryBoy: 1, workflowStatus: 1 });
orderSchema.index({ paymentMode: 1, paymentStatus: 1, createdAt: -1 });
orderSchema.index({ orderStatus: 1, "settlementStatus.overall": 1, createdAt: -1 });
orderSchema.index({ seller: 1, "settlementStatus.sellerPayout": 1, status: 1 });
orderSchema.index({ deliveryBoy: 1, "settlementStatus.riderPayout": 1, status: 1 });
orderSchema.index(
  { customer: 1, "placement.idempotencyKey": 1, createdAt: -1 },
  {
    partialFilterExpression: {
      "placement.idempotencyKey": { $type: "string" },
    },
  },
);
orderSchema.index({ "stockReservation.status": 1, "stockReservation.expiresAt": 1 });
orderSchema.index({ checkoutGroupId: 1, createdAt: -1 });
orderSchema.index({ checkoutGroupId: 1, checkoutGroupIndex: 1 });
orderSchema.index(
  { "placement.idempotencyKeyExpiry": 1 },
  { 
    expireAfterSeconds: 0,
    partialFilterExpression: { "placement.idempotencyKeyExpiry": { $type: "date" } }
  }
);

orderSchema.pre('save', function(next) {
  if (!this.orderStatus) {
    this.orderStatus = this.status || "pending";
  }
  if (!this.status && this.orderStatus) {
    this.status = this.orderStatus;
  }
  if (!this.paymentMode) {
    const method = String(this.payment?.method || "").toLowerCase();
    this.paymentMode = method === "online" ? "ONLINE" : "COD";
  }
  if (!this.paymentStatus) {
    const paymentStatusLegacy = String(this.payment?.status || "").toLowerCase();
    if (this.paymentMode === "ONLINE") {
      this.paymentStatus = paymentStatusLegacy === "completed" ? "PAID" : "CREATED";
    } else {
      this.paymentStatus = paymentStatusLegacy === "completed" ? "CASH_COLLECTED" : "PENDING_CASH_COLLECTION";
    }
  }
  if (!this.settlementStatus?.overall) {
    this.settlementStatus = {
      ...(this.settlementStatus || {}),
      overall: this.settlementStatus?.overall || "PENDING",
      sellerPayout: this.settlementStatus?.sellerPayout || "PENDING",
      riderPayout: this.settlementStatus?.riderPayout || "PENDING",
      adminEarningCredited: Boolean(this.settlementStatus?.adminEarningCredited),
      reconciledAt: this.settlementStatus?.reconciledAt || null,
    };
  }
  if (!this.deliveryPartner && this.deliveryBoy) {
    this.deliveryPartner = this.deliveryBoy;
  }
  if (!this.deliveryBoy && this.deliveryPartner) {
    this.deliveryBoy = this.deliveryPartner;
  }
  if (!this.customer) {
    const error = new Error('Order must have a valid customer reference');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

orderSchema.pre('findOneAndUpdate', function(next) {
  const update = this.getUpdate();
  if (update.$unset && update.$unset.customer) {
    const error = new Error('Cannot unset customer field from order');
    error.name = 'ValidationError';
    return next(error);
  }
  if (update.$set && update.$set.customer === null) {
    const error = new Error('Cannot set customer field to null');
    error.name = 'ValidationError';
    return next(error);
  }
  next();
});

export default mongoose.model("Order", orderSchema);
