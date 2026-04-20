import mongoose from "mongoose";

const deliveryAssignmentSchema = new mongoose.Schema(
  {
    orderMongoId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Order",
      required: true,
      index: true,
    },
    orderId: {
      type: String,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["broadcasting", "assigned", "superseded", "timeout", "cancelled"],
      default: "broadcasting",
    },
    winnerDeliveryId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Delivery",
    },
    radiusMeters: {
      type: Number,
      default: 5000,
    },
    attempt: {
      type: Number,
      default: 1,
    },
    expiresAt: Date,
    candidateIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Delivery",
      },
    ],
    meta: {
      type: mongoose.Schema.Types.Mixed,
    },
  },
  { timestamps: true },
);

deliveryAssignmentSchema.index({ orderId: 1, createdAt: -1 });

export default mongoose.model("DeliveryAssignment", deliveryAssignmentSchema);
