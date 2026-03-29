import express from "express";
import { createContentLengthGuard } from "../../middleware/securityMiddlewares.js";
import {
  smsOtpSendRateLimiter,
  smsOtpVerifyRateLimiter,
} from "../../middleware/rateLimiters.js";
import { sendOtpController, verifyOtpController } from "./otp.controller.js";

const router = express.Router();

const otpPayloadGuard = createContentLengthGuard(
  parseInt(process.env.AUTH_MAX_PAYLOAD_BYTES || "16384", 10),
  "OTP payload too large",
);

router.post("/send", smsOtpSendRateLimiter, otpPayloadGuard, sendOtpController);
router.post("/verify", smsOtpVerifyRateLimiter, otpPayloadGuard, verifyOtpController);

export default router;
