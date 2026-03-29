import { byIp, byUserOrIp, createRateLimiter } from "./rateLimiter.js";

const GLOBAL_RATE_LIMIT_WINDOW_MS = () =>
  parseInt(process.env.GLOBAL_RATE_LIMIT_WINDOW_MS || "60000", 10);
const GLOBAL_RATE_LIMIT_MAX = () =>
  parseInt(process.env.GLOBAL_RATE_LIMIT_MAX || "240", 10);

const AUTH_RATE_LIMIT_WINDOW_MS = () =>
  parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "60000", 10);
const AUTH_RATE_LIMIT_MAX = () =>
  parseInt(process.env.AUTH_RATE_LIMIT_MAX || "40", 10);

const OTP_RATE_LIMIT_WINDOW_MS = () =>
  parseInt(process.env.OTP_RATE_LIMIT_WINDOW_MS || "60000", 10);
const OTP_RATE_LIMIT_MAX = () =>
  parseInt(process.env.OTP_RATE_LIMIT_MAX || "15", 10);

const PAYMENT_RATE_LIMIT_WINDOW_MS = () =>
  parseInt(process.env.PAYMENT_RATE_LIMIT_WINDOW_MS || "60000", 10);
const PAYMENT_RATE_LIMIT_MAX = () =>
  parseInt(process.env.PAYMENT_RATE_LIMIT_MAX || "25", 10);

const ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS = () =>
  parseInt(process.env.ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS || "900000", 10);
const ADMIN_BOOTSTRAP_RATE_LIMIT_MAX = () =>
  parseInt(process.env.ADMIN_BOOTSTRAP_RATE_LIMIT_MAX || "10", 10);

export const globalApiRateLimiter = createRateLimiter({
  namespace: "global",
  windowMs: GLOBAL_RATE_LIMIT_WINDOW_MS(),
  max: GLOBAL_RATE_LIMIT_MAX(),
  keyGenerator: byIp,
  message: "Too many requests from this IP. Please retry shortly.",
});

export const authRouteRateLimiter = createRateLimiter({
  namespace: "auth",
  windowMs: AUTH_RATE_LIMIT_WINDOW_MS(),
  max: AUTH_RATE_LIMIT_MAX(),
  keyGenerator: byIp,
  message: "Too many authentication requests. Please wait and retry.",
});

export const otpRouteRateLimiter = createRateLimiter({
  namespace: "otp",
  windowMs: OTP_RATE_LIMIT_WINDOW_MS(),
  max: OTP_RATE_LIMIT_MAX(),
  keyGenerator: byIp,
  message: "Too many OTP requests. Please wait before retrying.",
});

export const paymentRouteRateLimiter = createRateLimiter({
  namespace: "payment",
  windowMs: PAYMENT_RATE_LIMIT_WINDOW_MS(),
  max: PAYMENT_RATE_LIMIT_MAX(),
  keyGenerator: byUserOrIp,
  message: "Too many payment requests. Please wait before retrying.",
});

export const adminBootstrapRateLimiter = createRateLimiter({
  namespace: "admin_bootstrap",
  windowMs: ADMIN_BOOTSTRAP_RATE_LIMIT_WINDOW_MS(),
  max: ADMIN_BOOTSTRAP_RATE_LIMIT_MAX(),
  keyGenerator: byIp,
  message: "Too many admin bootstrap attempts. Please wait before retrying.",
});

export function createContentLengthGuard(maxBytes, message = "Payload too large") {
  const safeMax = Math.max(1024, Number(maxBytes || 1024 * 1024));
  return (req, res, next) => {
    const raw = Number(req.headers["content-length"] || 0);
    if (Number.isFinite(raw) && raw > safeMax) {
      return res.status(413).json({
        success: false,
        error: true,
        message,
        result: {
          code: "PAYLOAD_TOO_LARGE",
          maxBytes: safeMax,
        },
      });
    }
    return next();
  };
}
