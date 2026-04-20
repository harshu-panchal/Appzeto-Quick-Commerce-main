const DEFAULT_COUNTRY_CODE = process.env.DEFAULT_PHONE_COUNTRY_CODE || "+91";

export function normalizePhoneNumber(rawPhone) {
  if (rawPhone == null) return "";
  let value = String(rawPhone).trim();
  if (!value) return "";

  value = value.replace(/[\s().-]/g, "");
  if (value.startsWith("00")) {
    value = `+${value.slice(2)}`;
  }

  if (!value.startsWith("+")) {
    if (/^\d{10}$/.test(value)) {
      value = `${DEFAULT_COUNTRY_CODE}${value}`;
    } else {
      value = `+${value}`;
    }
  }

  const normalized = value.replace(/[^\d+]/g, "");
  return normalized;
}

export function isValidE164Phone(phone) {
  return /^\+[1-9]\d{7,14}$/.test(String(phone || ""));
}

export function maskPhone(phone) {
  const value = String(phone || "");
  if (value.length <= 4) return "***";
  return `${value.slice(0, 3)}***${value.slice(-2)}`;
}
