import mongoose from "mongoose";

const stockHistorySchema = new mongoose.Schema(
    {
        product: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Product",
            required: true,
        },
        seller: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Seller",
            required: true,
        },
        type: {
            type: String,
            enum: ["Restock", "Sale", "Correction", "Reservation", "Release"],
            required: true,
        },
        quantity: {
            type: Number, // Positive for restock, negative for sale/correction
            required: true,
        },
        note: {
            type: String,
            trim: true,
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
    },
    { timestamps: true }
);

stockHistorySchema.index({ product: 1, seller: 1, createdAt: -1 });
stockHistorySchema.index({ order: 1 });
stockHistorySchema.index({ type: 1 });

export default mongoose.model("StockHistory", stockHistorySchema);
