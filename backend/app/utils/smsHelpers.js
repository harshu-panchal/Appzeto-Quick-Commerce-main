import crypto from "crypto";

const DEFAULT_OTP_LENGTH = 4;

export function normalizeMobile(mobile) {
  return String(mobile || "").replace(/\D/g, "").slice(-10);
}

export function toIndianNumber(mobile) {
  const normalized = normalizeMobile(mobile);
  return normalized ? `91${normalized}` : "";
}

export function getOtpLength() {
  const parsed = parseInt(process.env.OTP_LENGTH || `${DEFAULT_OTP_LENGTH}`, 10);
  return Number.isFinite(parsed) && parsed >= 4 ? parsed : DEFAULT_OTP_LENGTH;
}

export function generateOTP(length = getOtpLength()) {
  const safeLength = Math.max(4, Number(length || DEFAULT_OTP_LENGTH));
  const min = 10 ** (safeLength - 1);
  const max = 10 ** safeLength;
  return crypto.randomInt(min, max).toString();
}

export function buildMessage(otp) {
  const minutes = parseInt(process.env.OTP_EXPIRY_MINUTES || "5", 10);
  const template = String(
    process.env.SMS_INDIA_HUB_TEMPLATE_TEXT ||
      "Your OTP is {{OTP}}. Valid for {{MINUTES}} minutes.",
  );
  const appName = String(process.env.APP_NAME || "Noyo").trim();

  // Primary replacements for common tags
  let msg = template
    .replace(/\{\{OTP\}\}/g, String(otp))
    .replace(/\{\{MINUTES\}\}/g, String(minutes))
    .replace(/\{\{APP_NAME\}\}/g, appName)
    .replace(/\$\{otp\}/g, String(otp))
    .replace(/\$\{minutes\}/g, String(minutes))
    .replace(/\$\{appName\}/g, appName);

  // DLT templates often use generic variable tokens. Replace them in a stable order
  // so the generated content always matches the approved template wording.
  const genericPlaceholders = [
    "##var##",
    "{#var#}",
    "{#VAR#}",
    "{#var1#}",
    "{#var2#}",
    "{#var3#}",
  ];
  const replacementOrder = [appName, String(otp), String(minutes)];

  genericPlaceholders.forEach((placeholder) => {
    let occurrence = 0;
    while (msg.includes(placeholder)) {
      const replacement =
        replacementOrder[Math.min(occurrence, replacementOrder.length - 1)];
      msg = msg.replace(placeholder, replacement);
      occurrence += 1;
    }
  });

  return msg;
}


