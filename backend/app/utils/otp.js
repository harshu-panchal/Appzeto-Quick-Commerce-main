/**
 * OTP utility - switches between real SMS OTP and mock OTP based on USE_REAL_SMS env.
 * - USE_REAL_SMS=true  → generate random 4-digit OTP (user enters OTP received via SMS)
 * - USE_REAL_SMS=false → return mock OTP "1234" (no SMS sent, for dev/testing)
 */
const MOCK_OTP = "1234";

export const useRealSMS = () =>
    process.env.USE_REAL_SMS === "true" || process.env.USE_REAL_SMS === "1";

export const generateOTP = () =>
    useRealSMS()
        ? Math.floor(1000 + Math.random() * 9000).toString()
        : MOCK_OTP;

export { MOCK_OTP };
