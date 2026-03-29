import express from "express";
import {
  createRazorpayOrder,
  handleRazorpayWebhook,
  verifyPayment,
} from "../controller/paymentController.js";
import { allowRoles, verifyToken } from "../middleware/authMiddleware.js";
import {
  createContentLengthGuard,
  paymentRouteRateLimiter,
} from "../middleware/securityMiddlewares.js";

const router = express.Router();

const paymentPayloadLimit = createContentLengthGuard(
  parseInt(process.env.PAYMENT_MAX_PAYLOAD_BYTES || "24576", 10),
  "Payment payload too large",
);

router.post(
  "/create-order",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  paymentRouteRateLimiter,
  paymentPayloadLimit,
  createRazorpayOrder,
);
router.post(
  "/verify",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  paymentRouteRateLimiter,
  paymentPayloadLimit,
  verifyPayment,
);
router.post(
  "/webhook/razorpay",
  paymentRouteRateLimiter,
  handleRazorpayWebhook,
);

export default router;
