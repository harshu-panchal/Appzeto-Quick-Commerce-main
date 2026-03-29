import mongoose from "mongoose";

/**
 * DashboardStats Model
 * 
 * Stores precomputed dashboard statistics for fast read access.
 * Updated asynchronously by worker processes to separate read-heavy
 * dashboard queries from transactional writes.
 */

const dashboardStatsSchema = new mongoose.Schema(
  {
    metric: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    lastUpdated: {
      type: Date,
      default: Date.now,
      index: true,
    },
  },
  { 
    timestamps: true,
    collection: "dashboardstats",
  }
);

// Index for staleness checks
dashboardStatsSchema.index({ lastUpdated: -1 });

export default mongoose.model("DashboardStats", dashboardStatsSchema);
