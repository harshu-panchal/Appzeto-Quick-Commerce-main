import mongoose from "mongoose";

/**
 * FinanceReports Model
 * 
 * Stores daily financial summary reports for admin dashboard.
 * Updated asynchronously by worker processes to provide fast
 * access to revenue, commission, and payout totals without
 * expensive real-time aggregations.
 */

const financeReportsSchema = new mongoose.Schema(
  {
    date: {
      type: Date,
      required: true,
      unique: true,
      index: true,
    },
    totalRevenue: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalCommission: {
      type: Number,
      default: 0,
      min: 0,
    },
    totalPayouts: {
      type: Number,
      default: 0,
      min: 0,
    },
    orderCount: {
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
    collection: "financereports",
  }
);

// Index for date-based queries (descending for recent-first)
financeReportsSchema.index({ date: -1 });

export default mongoose.model("FinanceReports", financeReportsSchema);
