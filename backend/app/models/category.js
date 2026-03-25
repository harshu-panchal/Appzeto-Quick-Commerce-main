import mongoose from "mongoose";
import {
  ALL_COMMISSION_FIXED_RULES,
  ALL_COMMISSION_TYPES,
  ALL_HANDLING_FEE_TYPES,
} from "../constants/finance.js";

const categorySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    description: {
      type: String,
      trim: true,
    },
    image: {
      type: String, // Cloudinary URL
    },
    iconId: {
      type: String, // SVG icon identifier
      trim: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    type: {
      type: String,
      enum: ["header", "category", "subcategory"],
      required: true,
    },
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    adminCommission: {
      type: Number,
      default: 0, // Percentage
    },
    adminCommissionType: {
      type: String,
      enum: ALL_COMMISSION_TYPES,
      default: "percentage",
    },
    adminCommissionValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    adminCommissionFixedRule: {
      type: String,
      enum: ALL_COMMISSION_FIXED_RULES,
      default: "per_qty",
    },
    handlingFees: {
      type: Number,
      default: 0, // Flat amount
    },
    handlingFeeType: {
      type: String,
      enum: ALL_HANDLING_FEE_TYPES,
      default: "fixed",
    },
    handlingFeeValue: {
      type: Number,
      default: 0,
      min: 0,
    },
    headerColor: {
      type: String,
      trim: true, // Hex color selected in admin panel (e.g. #ff0000)
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

categorySchema.pre("save", function syncLegacyFinanceFields(next) {
  if (this.adminCommissionValue == null) {
    this.adminCommissionValue = this.adminCommission ?? 0;
  }

  if (this.adminCommission == null) {
    this.adminCommission = this.adminCommissionType === "percentage" ? (this.adminCommissionValue ?? 0) : 0;
  }

  if (this.handlingFeeValue == null) {
    this.handlingFeeValue = this.handlingFees ?? 0;
  }

  if (this.handlingFees == null) {
    this.handlingFees = this.handlingFeeType === "fixed" ? (this.handlingFeeValue ?? 0) : 0;
  }

  if (this.handlingFeeType === "none") {
    this.handlingFees = 0;
    this.handlingFeeValue = 0;
  }

  next();
});

// Indexes for common queries
categorySchema.index({ type: 1, status: 1 });
categorySchema.index({ parentId: 1, status: 1 });
categorySchema.index({ name: 1 });

// Virtual for children categories
categorySchema.virtual("children", {
  ref: "Category",
  localField: "_id",
  foreignField: "parentId",
});

export default mongoose.model("Category", categorySchema);
