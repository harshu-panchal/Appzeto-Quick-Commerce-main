import Razorpay from "razorpay";
import crypto from "crypto";
import handleResponse from "../utils/helper.js";
import Order from "../models/order.js";

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* ===============================
   CREATE RAZORPAY ORDER
================================ */
export const createRazorpayOrder = async (req, res) => {
    try {
        const { amount, currency = "INR" } = req.body;

        if (!amount) {
            return handleResponse(res, 400, "Amount is required");
        }

        const options = {
            amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
            currency,
            receipt: `receipt_${Date.now()}`,
        };

        const order = await razorpay.orders.create(options);

        return handleResponse(res, 200, "Razorpay order created", order);
    } catch (error) {
        console.error("Razorpay Order Error:", error);
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   VERIFY PAYMENT SIGNATURE
================================ */
export const verifyPayment = async (req, res) => {
    try {
        const {
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
            orderId // Our internal orderId (ORD...)
        } = req.body;

        const body = razorpay_order_id + "|" + razorpay_payment_id;

        const expectedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(body.toString())
            .digest("hex");

        const isAuthentic = expectedSignature === razorpay_signature;

        if (isAuthentic) {
            // Update order payment status
            if (orderId) {
                const order = await Order.findOne({ orderId });
                if (order) {
                    order.payment.status = "completed";
                    order.payment.transactionId = razorpay_payment_id;
                    await order.save();
                }
            }

            return handleResponse(res, 200, "Payment verified successfully", {
                signatureIsValid: true,
                paymentId: razorpay_payment_id
            });
        } else {
            return handleResponse(res, 400, "Payment verification failed", {
                signatureIsValid: false
            });
        }
    } catch (error) {
        console.error("Payment Verification Error:", error);
        return handleResponse(res, 500, error.message);
    }
};
