const MOCK_OTP = "1234";

export const useRealSMS = () =>
  process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1";

const OTP_LENGTH = Math.max(4, parseInt(process.env.OTP_LENGTH || "4", 10));

function randomOtp(length) {
  const min = Math.pow(10, length - 1);
  const max = Math.pow(10, length) - 1;
  return String(Math.floor(min + Math.random() * (max - min + 1)));
}

export const generateOTP = () => {
  const production = process.env.NODE_ENV === "production";
  if (production && !useRealSMS()) {
    const err = new Error("Mock OTP mode is disabled in production");
    err.statusCode = 500;
    throw err;
  }
  return useRealSMS() ? randomOtp(OTP_LENGTH) : MOCK_OTP;
};

export { MOCK_OTP };
