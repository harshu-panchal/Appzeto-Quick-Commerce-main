import { byIp, createRateLimiter, getClientIp } from "./rateLimiter.js";

const OTP_SEND_WINDOW_MS = () =>
  parseInt(process.env.OTP_SEND_RATE_LIMIT_WINDOW_MS || "900000", 10);
const OTP_SEND_MAX = () =>
  parseInt(process.env.OTP_SEND_RATE_LIMIT_MAX || "5", 10);
const OTP_VERIFY_WINDOW_MS = () =>
  parseInt(process.env.OTP_VERIFY_RATE_LIMIT_WINDOW_MS || "900000", 10);
const OTP_VERIFY_MAX = () =>
  parseInt(process.env.OTP_VERIFY_RATE_LIMIT_MAX || "10", 10);

function byMobileOrIp(req) {
  const digits = String(req.body?.mobile || "").replace(/\D/g, "").slice(-10);
  if (!digits) {
    return byIp(req);
  }
  return `${digits}:${getClientIp(req)}`;
}

export const smsOtpSendRateLimiter = createRateLimiter({
  namespace: "sms_otp_send",
  windowMs: OTP_SEND_WINDOW_MS(),
  max: OTP_SEND_MAX(),
  keyGenerator: byMobileOrIp,
  message: "Too many OTP send requests. Please wait before trying again.",
});

export const smsOtpVerifyRateLimiter = createRateLimiter({
  namespace: "sms_otp_verify",
  windowMs: OTP_VERIFY_WINDOW_MS(),
  max: OTP_VERIFY_MAX(),
  keyGenerator: byMobileOrIp,
  message: "Too many OTP verification requests. Please wait before trying again.",
});
