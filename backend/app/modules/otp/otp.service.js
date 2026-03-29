import axios from "axios";
import crypto from "crypto";
import jwt from "jsonwebtoken";
import OtpSession from "./otp.model.js";
import Admin from "../../models/admin.js";
import Seller from "../../models/seller.js";
import Customer from "../../models/customer.js";
import Delivery from "../../models/delivery.js";
import logger from "../../services/logger.js";
import {
  buildMessage,
  generateOTP,
  getOtpLength,
  normalizeMobile,
  toIndianNumber,
} from "../../utils/smsHelpers.js";

const SUPPORTED_USER_TYPES = ["Admin", "Seller", "Customer", "Delivery"];
const SUPPORTED_PURPOSES = ["LOGIN", "SIGNUP", "PASSWORD_RESET"];
const SMS_INDIA_SUCCESS_CODE = "000";

const USER_TYPE_CONFIG = {
  Admin: { model: Admin, tokenRole: "admin" },
  Seller: { model: Seller, tokenRole: "seller" },
  Customer: { model: Customer, tokenRole: "customer" },
  Delivery: { model: Delivery, tokenRole: "delivery" },
};

function otpHashSecret() {
  return process.env.OTP_HASH_SECRET || process.env.JWT_SECRET || "unsafe-dev-secret";
}

function hashOtp(mobile, otp, userType, purpose) {
  return crypto
    .createHmac("sha256", otpHashSecret())
    .update(`${mobile}:${userType}:${purpose}:${otp}`)
    .digest("hex");
}

function safeCompare(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");
  if (leftBuffer.length === 0 || leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function isMockOtpEnabled() {
  if (process.env.USE_MOCK_OTP === "true" || process.env.USE_MOCK_OTP === "1") {
    return true;
  }
  if (process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1") {
    return false;
  }
  return process.env.NODE_ENV !== "production";
}

function getExpiryMinutes() {
  const parsed = parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function getMaxAttempts() {
  const parsed = parseInt(process.env.OTP_MAX_FAILED_ATTEMPTS || "5", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5;
}

function getSmsIndiaConfig() {
  return {
    apiKey: process.env.SMS_INDIA_HUB_API_KEY,
    senderId: process.env.SMS_INDIA_HUB_SENDER_ID,
    dltTemplateId: process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID,
    gatewayId: process.env.SMS_INDIA_HUB_GWID || "2",
    url:
      process.env.SMS_INDIA_HUB_URL ||
      "http://cloud.smsindiahub.in/vendorsms/pushsms.aspx",
  };
}

function assertSupportedEnums({ userType, purpose }) {
  if (!SUPPORTED_USER_TYPES.includes(userType)) {
    const error = new Error("Unsupported userType");
    error.statusCode = 400;
    throw error;
  }
  if (!SUPPORTED_PURPOSES.includes(purpose)) {
    const error = new Error("Unsupported purpose");
    error.statusCode = 400;
    throw error;
  }
}

function assertValidMobile(mobile) {
  const normalized = normalizeMobile(mobile);
  if (!/^\d{10}$/.test(normalized)) {
    const error = new Error("A valid 10-digit Indian mobile number is required");
    error.statusCode = 400;
    throw error;
  }
  return normalized;
}

function getPhoneCandidates(mobile) {
  const normalized = assertValidMobile(mobile);
  return [...new Set([normalized, `91${normalized}`, `+91${normalized}`])];
}

async function findAccountByUserType(userType, mobile) {
  const config = USER_TYPE_CONFIG[userType];
  const phoneCandidates = getPhoneCandidates(mobile);
  return config.model.findOne({ phone: { $in: phoneCandidates } });
}

function assertPurposeEligibility({ purpose, account, userType }) {
  if (purpose === "LOGIN" || purpose === "PASSWORD_RESET") {
    if (!account) {
      const error = new Error(`${userType} account not found`);
      error.statusCode = 404;
      throw error;
    }
  }

  if (purpose === "SIGNUP" && account) {
    const error = new Error(`${userType} account already exists`);
    error.statusCode = 409;
    throw error;
  }
}

function normalizeProviderPayload(payload) {
  return typeof payload === "string" ? payload : JSON.stringify(payload || {});
}

function parseSmsIndiaResponse(payload) {
  const raw = normalizeProviderPayload(payload);
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();

  const directCode = trimmed.slice(0, 3);
  if (/^\d{3}$/.test(directCode)) {
    return { code: directCode, raw };
  }

  const xmlStatusMatch = trimmed.match(/<status>\s*([^<]+)\s*<\/status>/i);
  if (xmlStatusMatch) {
    const statusValue = String(xmlStatusMatch[1] || "").trim();
    if (/^\d{3}$/.test(statusValue)) {
      return { code: statusValue, raw };
    }
    if (["success", "ok", "done", "submitted"].includes(statusValue.toLowerCase())) {
      return { code: "000", raw };
    }
  }

  const jsonStatusMatch = trimmed.match(/"status"\s*:\s*"?(success|ok|done|submitted|000)"?/i);
  if (jsonStatusMatch) {
    return { code: "000", raw };
  }

  const matched = trimmed.match(/\b(\d{3})\b/);
  if (matched) {
    return { code: matched[1], raw };
  }

  if (
    lower === "success" ||
    lower === "ok" ||
    lower === "done" ||
    lower.startsWith("success#") ||
    lower.startsWith("done#") ||
    lower.includes("message submitted")
  ) {
    return { code: "000", raw };
  }

  return { code: null, raw };
}

function providerSnippet(raw) {
  return String(raw || "").replace(/\s+/g, " ").trim().slice(0, 180);
}

function mapSmsIndiaError(code) {
  const messages = {
    "001": "SMS India HUB configuration issue",
    "006": "SMS India HUB DLT template mismatch",
    "007": "SMS India HUB API key is invalid",
    "021": "SMS India HUB credits exhausted",
  };
  const error = new Error(messages[code] || "SMS India HUB request failed");
  error.statusCode = code === "001" || code === "006" || code === "007" ? 500 : 502;
  error.providerCode = code;
  return error;
}

async function sendSmsViaSmsIndiaHub({ mobile, otp }) {
  const config = getSmsIndiaConfig();
  const requiredConfig = {
    apiKey: config.apiKey,
    senderId: config.senderId,
    url: config.url,
  };
  const missing = Object.entries(requiredConfig)
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    const error = new Error(`Missing SMS India HUB config: ${missing.join(", ")}`);
    error.statusCode = 500;
    throw error;
  }

  const response = await axios.get(config.url, {
    params: {
      APIKey: config.apiKey,
      msisdn: toIndianNumber(mobile),
      sid: config.senderId,
      msg: buildMessage(otp),
      fl: "0",
      gwid: String(config.gatewayId || "2"),
      ...(config.dltTemplateId ? { DLT_TE_ID: config.dltTemplateId } : {}),
    },
    timeout: parseInt(process.env.SMS_INDIA_HUB_TIMEOUT_MS || "10000", 10),
  });

  const body = response.data;
  const inlineErrorCode = body && typeof body === "object" ? body.ErrorCode : null;
  const { code: providerCode, raw } = parseSmsIndiaResponse(body);
  const effectiveCode = inlineErrorCode || providerCode;
  if (effectiveCode !== SMS_INDIA_SUCCESS_CODE) {
    const error = mapSmsIndiaError(effectiveCode);
    error.message = `${error.message}${raw ? `: ${providerSnippet(raw)}` : ""}`;
    error.providerRaw = raw;
    throw error;
  }

  return {
    provider: "sms_india_hub",
    providerCode,
    rawResponse: response.data,
  };
}

function buildToken(account, userType) {
  const config = USER_TYPE_CONFIG[userType];
  return jwt.sign(
    { id: account._id, role: config.tokenRole },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "7d" },
  );
}

function sanitizeAccount(account) {
  if (!account) {
    return null;
  }
  const obj = typeof account.toObject === "function" ? account.toObject() : { ...account };
  delete obj.password;
  delete obj.__v;
  delete obj.otp;
  delete obj.otpHash;
  delete obj.otpExpiry;
  delete obj.otpExpiresAt;
  return obj;
}

async function markAccountVerified(account, userType) {
  if (!account) {
    return null;
  }

  account.lastLogin = new Date();

  if ("isVerified" in account) {
    account.isVerified = true;
  }
  if (userType === "Seller" && "phoneVerified" in account) {
    account.phoneVerified = true;
  }

  await account.save();
  return account;
}

export async function sendSmsOtp({ mobile, userType, purpose, ipAddress = "unknown" }) {
  assertSupportedEnums({ userType, purpose });

  const normalizedMobile = assertValidMobile(mobile);
  const account = await findAccountByUserType(userType, normalizedMobile);
  assertPurposeEligibility({ purpose, account, userType });

  if (process.env.NODE_ENV === "production" && isMockOtpEnabled()) {
    const error = new Error("Mock OTP mode cannot be enabled in production");
    error.statusCode = 500;
    throw error;
  }

  const otp = generateOTP(getOtpLength());
  const expiresAt = new Date(Date.now() + getExpiryMinutes() * 60 * 1000);

  await OtpSession.deleteMany({ mobile: normalizedMobile, userType, purpose });

  const otpHash = hashOtp(normalizedMobile, otp, userType, purpose);
  const smsResult = isMockOtpEnabled()
    ? { provider: "mock", providerCode: "MOCK" }
    : await sendSmsViaSmsIndiaHub({ mobile: normalizedMobile, otp });

  await OtpSession.create({
    mobile: normalizedMobile,
    userType,
    purpose,
    otpHash,
    expiresAt,
    maxAttempts: getMaxAttempts(),
  });

  logger.info("OTP session created", {
    module: "sms-otp",
    userType,
    purpose,
    mobile: normalizedMobile,
    ipAddress,
    provider: smsResult.provider,
  });

  const response = {
    sent: true,
    mobile: normalizedMobile,
    userType,
    purpose,
    expiresInSeconds: getExpiryMinutes() * 60,
    provider: smsResult.provider,
  };

  if (isMockOtpEnabled()) {
    response.mockOtp = otp;
  }

  return response;
}

export async function verifySmsOtp({ mobile, otp, userType, purpose, ipAddress = "unknown" }) {
  assertSupportedEnums({ userType, purpose });

  const normalizedMobile = assertValidMobile(mobile);
  const code = String(otp || "").trim();
  const otpPattern = new RegExp(`^\\d{${getOtpLength()}}$`);
  if (!otpPattern.test(code)) {
    const error = new Error(`OTP must be exactly ${getOtpLength()} digits`);
    error.statusCode = 400;
    throw error;
  }

  const session = await OtpSession.findOne({
    mobile: normalizedMobile,
    userType,
    purpose,
  }).select("+otpHash +expiresAt");

  if (!session) {
    const error = new Error("Invalid or expired OTP");
    error.statusCode = 400;
    throw error;
  }

  const now = new Date();
  if (!session.expiresAt || session.expiresAt <= now) {
    await OtpSession.deleteOne({ _id: session._id });
    const error = new Error("OTP has expired");
    error.statusCode = 400;
    throw error;
  }

  if ((session.attempts || 0) >= (session.maxAttempts || getMaxAttempts())) {
    await OtpSession.deleteOne({ _id: session._id });
    const error = new Error("Maximum OTP verification attempts exceeded");
    error.statusCode = 429;
    throw error;
  }

  const incomingHash = hashOtp(normalizedMobile, code, userType, purpose);
  if (!safeCompare(session.otpHash, incomingHash)) {
    const nextAttempts = (session.attempts || 0) + 1;
    if (nextAttempts >= (session.maxAttempts || getMaxAttempts())) {
      await OtpSession.deleteOne({ _id: session._id });
      const error = new Error("Maximum OTP verification attempts exceeded");
      error.statusCode = 429;
      throw error;
    }

    session.attempts = nextAttempts;
    session.lastAttemptAt = now;
    await session.save();

    const error = new Error("Invalid OTP");
    error.statusCode = 400;
    error.attemptsRemaining = (session.maxAttempts || getMaxAttempts()) - nextAttempts;
    throw error;
  }

  session.isVerified = true;
  session.lastAttemptAt = now;
  await session.save();
  await OtpSession.deleteOne({ _id: session._id });

  const account = await findAccountByUserType(userType, normalizedMobile);
  let token = null;
  let sanitizedAccount = null;

  if (account && (purpose === "LOGIN" || purpose === "PASSWORD_RESET")) {
    const verifiedAccount = await markAccountVerified(account, userType);
    token = buildToken(verifiedAccount, userType);
    sanitizedAccount = sanitizeAccount(verifiedAccount);
  }

  logger.info("OTP verified", {
    module: "sms-otp",
    userType,
    purpose,
    mobile: normalizedMobile,
    ipAddress,
  });

  return {
    verified: true,
    mobile: normalizedMobile,
    userType,
    purpose,
    token,
    account: sanitizedAccount,
  };
}

export const __testables = {
  assertValidMobile,
  getPhoneCandidates,
  hashOtp,
  isMockOtpEnabled,
  mapSmsIndiaError,
  parseSmsIndiaResponse,
  sanitizeAccount,
};
