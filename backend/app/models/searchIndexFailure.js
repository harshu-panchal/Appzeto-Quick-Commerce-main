import mongoose from "mongoose";

/**
 * SearchIndexFailure Model
 * 
 * Tracks failed search indexing operations for manual review and retry.
 * When async search indexing fails after all retry attempts, the failure
 * is logged here for operational visibility and manual intervention.
 */

const searchIndexFailureSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },
    operation: {
      type: String,
      enum: ["index", "remove"],
      required: true,
    },
    error: {
      type: String,
      required: true,
    },
    attempts: {
      type: Number,
      default: 1,
      min: 1,
    },
    lastAttempt: {
      type: Date,
      default: Date.now,
    },
    resolved: {
      type: Boolean,
      default: false,
      index: true,
    },
    resolvedAt: {
      type: Date,
      default: null,
    },
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { 
    timestamps: true,
    collection: "searchindexfailures",
  }
);

// Compound index for querying unresolved failures
searchIndexFailureSchema.index({ resolved: 1, lastAttempt: -1 });

// Index for product-specific failure lookup
searchIndexFailureSchema.index({ productId: 1, resolved: 1 });

export default mongoose.model("SearchIndexFailure", searchIndexFailureSchema);
