import mongoose from "mongoose";

const cartSchema = new mongoose.Schema(
    {
        customerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Customer",
            required: true,
            unique: true,
        },
        items: [
            {
                productId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Product",
                    required: true,
                },
                // Distinguish product variants inside the cart.
                // We use variant SKU because Product.variants includes a sku field.
                // Empty string / null means "base product" (no variant selected).
                variantSku: {
                    type: String,
                    default: "",
                    trim: true,
                },
                quantity: {
                    type: Number,
                    required: true,
                    min: 1,
                    default: 1,
                },
            },
        ],
    },
    { timestamps: true }
);

const Cart = mongoose.model("Cart", cartSchema);
export default Cart;
