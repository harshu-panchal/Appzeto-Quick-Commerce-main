import mongoose from "mongoose";

/**
 * SellerMetrics Model
 * 
 * Stores daily seller performance metrics for fast dashboard access.
 * Updated asynchronously by worker processes to avoid impacting
 * transactional order processing.
 */

const sellerMetricsSchema = new mongoose.Schema(
  {
    sellerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Seller",
      required: true,
      index: true,
    },
    date: {
      type: Date,
      required: true,
      index: true,
    },
    orderCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    revenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    commission: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  { 
    timestamps: true,
    collection: "sellermetrics",
  }
);

// Compound index for seller dashboard queries
sellerMetricsSchema.index({ sellerId: 1, date: -1 });

// Unique constraint to prevent duplicate daily metrics
sellerMetricsSchema.index({ sellerId: 1, date: 1 }, { unique: true });

export default mongoose.model("SellerMetrics", sellerMetricsSchema);
