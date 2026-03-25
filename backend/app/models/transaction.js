import mongoose from "mongoose";

const transactionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
            refPath: "userModel",
        },
        userModel: {
            type: String,
            required: true,
            enum: ["Seller", "Delivery", "Admin", "User"],
        },
        order: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
        },
        type: {
            type: String,
            enum: ["Order Payment", "Delivery Earning", "Withdrawal", "Refund", "Incentive", "Bonus", "Cash Collection", "Cash Settlement"],
            required: true,
        },
        amount: {
            type: Number, // Positive for earnings, negative for withdrawals/refunds
            required: true,
        },
        status: {
            type: String,
            enum: ["Pending", "Processing", "Settled", "Failed"],
            default: "Pending",
        },
        reference: {
            type: String, // TXN ID or Order ID
            unique: true,
            required: true,
        },
        date: {
            type: Date,
            default: Date.now,
        },
        meta: {
            type: Object,
        },
    },
    { timestamps: true }
);

transactionSchema.index({ user: 1, userModel: 1, createdAt: -1 });
transactionSchema.index({ order: 1 });
transactionSchema.index({ status: 1, type: 1 });
transactionSchema.index({ reference: 1 }, { unique: true });

export default mongoose.model("Transaction", transactionSchema);
