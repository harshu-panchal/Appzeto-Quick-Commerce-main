import Joi from "joi";
import handleResponse from "../../utils/helper.js";
import { sendSmsOtp, verifySmsOtp } from "./otp.service.js";

const sendOtpSchema = Joi.object({
  mobile: Joi.string().trim().required(),
  userType: Joi.string()
    .valid("Admin", "Seller", "Customer", "Delivery")
    .required(),
  purpose: Joi.string()
    .valid("LOGIN", "SIGNUP", "PASSWORD_RESET")
    .required(),
});

const verifyOtpSchema = Joi.object({
  mobile: Joi.string().trim().required(),
  otp: Joi.string().trim().pattern(/^\d{4}$/).required(),
  userType: Joi.string()
    .valid("Admin", "Seller", "Customer", "Delivery")
    .required(),
  purpose: Joi.string()
    .valid("LOGIN", "SIGNUP", "PASSWORD_RESET")
    .required(),
});

function validateSchema(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });
  if (!error) {
    return value;
  }

  const validationError = new Error(
    error.details.map((detail) => detail.message).join("; "),
  );
  validationError.statusCode = 400;
  throw validationError;
}

export async function sendOtpController(req, res) {
  try {
    const payload = validateSchema(sendOtpSchema, req.body || {});
    const result = await sendSmsOtp({
      ...payload,
      ipAddress: req.ip,
    });
    return handleResponse(res, 200, "OTP sent successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message, {
      code: error.providerCode || "OTP_SEND_FAILED",
    });
  }
}

export async function verifyOtpController(req, res) {
  try {
    const payload = validateSchema(verifyOtpSchema, req.body || {});
    const result = await verifySmsOtp({
      ...payload,
      ipAddress: req.ip,
    });
    return handleResponse(res, 200, "OTP verified successfully", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message, {
      code: "OTP_VERIFY_FAILED",
      attemptsRemaining: error.attemptsRemaining,
    });
  }
}
