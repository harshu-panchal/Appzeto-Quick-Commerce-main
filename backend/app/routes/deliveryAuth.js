import express from "express";
import {
  signupDelivery,
  loginDelivery,
  verifyDeliveryOTP,
  getDeliveryProfile,
  updateDeliveryProfile,
} from "../controller/deliveryAuthController.js";
import {
  getDeliveryStats,
  getDeliveryEarnings,
  getMyDeliveryOrders,
  requestWithdrawal,
  updateDeliveryLocation,
  generateDeliveryOtp,
  validateDeliveryOtp,
} from "../controller/deliveryController.js";
import { getRiderWalletSummaryController } from "../controller/adminFinanceController.js";

import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
console.log("Delivery Auth Routes Loading...");

router.post(
  "/send-signup-otp",
  signupDelivery,
);
router.post("/send-login-otp", loginDelivery);
router.post("/verify-otp", verifyDeliveryOTP);

// Profile routes
router.get("/profile", verifyToken, getDeliveryProfile);
router.put("/profile", verifyToken, updateDeliveryProfile);
router.get("/stats", verifyToken, getDeliveryStats);
router.get("/earnings", verifyToken, getDeliveryEarnings);
router.get("/wallet/summary", verifyToken, allowRoles("delivery"), getRiderWalletSummaryController);
router.get(
  "/order-history",
  verifyToken,
  allowRoles("delivery"),
  getMyDeliveryOrders,
);
router.post("/request-withdrawal", verifyToken, requestWithdrawal);
router.post("/location", verifyToken, updateDeliveryLocation);

// OTP generation for delivery completion
router.post(
  "/orders/:orderId/generate-otp",
  verifyToken,
  allowRoles("delivery"),
  generateDeliveryOtp
);

// OTP validation for delivery completion
router.post(
  "/orders/:orderId/validate-otp",
  verifyToken,
  allowRoles("delivery"),
  validateDeliveryOtp
);

export default router;
