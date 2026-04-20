import mongoose from "mongoose";

const bannerItemSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true },
    title: { type: String, trim: true },
    subtitle: { type: String, trim: true },
    linkType: {
      type: String,
      enum: ["none", "header", "category", "subcategory", "product", "url"],
      default: "none",
    },
    linkValue: { type: String, trim: true },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { _id: false }
);

const configSchema = new mongoose.Schema(
  {
    // Banners configuration
    banners: {
      items: [bannerItemSchema],
    },
    // Category sections
    categories: {
      maxItems: { type: Number, min: 1 },
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      rows: { type: Number, min: 1 },
    },
    // Subcategory sections
    subcategories: {
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      subcategoryIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
      ],
      rows: { type: Number, min: 1 },
    },
    // Product sections
    products: {
      categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
      subcategoryIds: [
        { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
      ],
      productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
      rows: { type: Number, min: 1 },
      columns: { type: Number, min: 1 },
      singleRowScrollable: { type: Boolean, default: false },
    },
  },
  { _id: false }
);

const experienceSectionSchema = new mongoose.Schema(
  {
    pageType: {
      type: String,
      enum: ["home", "header"],
      required: true,
    },
    headerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Category",
      default: null,
    },
    displayType: {
      type: String,
      enum: ["banners", "categories", "subcategories", "products"],
      required: true,
    },
    title: {
      type: String,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
      min: 0,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
    config: configSchema,
  },
  { timestamps: true }
);

experienceSectionSchema.index({ pageType: 1, headerId: 1, order: 1 });

export default mongoose.model("ExperienceSection", experienceSectionSchema);

