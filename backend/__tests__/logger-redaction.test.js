import { sanitize } from "../app/services/logger.js";

describe("logger sensitive redaction", () => {
  test("redacts nested secrets, tokens and OTP values", () => {
    const input = {
      password: "p@ss",
      token: "abc",
      otpCode: "123456",
      paymentSignature: "sig-value",
      nested: {
        authorization: "Bearer xyz",
        refreshToken: "refresh",
      },
      safeField: "visible",
    };

    const output = sanitize(input);
    expect(output.password).toBe("[REDACTED]");
    expect(output.token).toBe("[REDACTED]");
    expect(output.otpCode).toBe("[REDACTED]");
    expect(output.paymentSignature).toBe("[REDACTED]");
    expect(output.nested.authorization).toBe("[REDACTED]");
    expect(output.nested.refreshToken).toBe("[REDACTED]");
    expect(output.safeField).toBe("visible");
  });
});
