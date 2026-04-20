import mongoose from "mongoose";

/**
 * Persistent geocode cache as a fallback when Redis is disabled/unavailable.
 * TTL is enforced via expiresAt index (MongoDB TTL monitor).
 */
const geocodeCacheSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    lat: { type: Number, required: true },
    lng: { type: Number, required: true },
    formattedAddress: { type: String },
    placeId: { type: String },
    types: { type: [String], default: [] },
    source: { type: String, enum: ["geocode-api"], default: "geocode-api" },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Mongo TTL index. Documents expire after expiresAt passes.
geocodeCacheSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model("GeocodeCache", geocodeCacheSchema);
