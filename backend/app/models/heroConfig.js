import mongoose from "mongoose";

const heroBannerItemSchema = new mongoose.Schema(
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

const heroConfigSchema = new mongoose.Schema(
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
    banners: {
      items: [heroBannerItemSchema],
      default: [],
    },
    categoryIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Category" },
    ],
  },
  { timestamps: true }
);

heroConfigSchema.index({ pageType: 1, headerId: 1 }, { unique: true });

export default mongoose.model("HeroConfig", heroConfigSchema);
