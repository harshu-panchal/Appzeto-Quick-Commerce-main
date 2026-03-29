import { jest } from "@jest/globals";

const mockOtpDeleteMany = jest.fn();
const mockOtpCreate = jest.fn();
const mockOtpDeleteOne = jest.fn();
const mockOtpFindOne = jest.fn();

const mockAdminFindOne = jest.fn();
const mockSellerFindOne = jest.fn();
const mockCustomerFindOne = jest.fn();
const mockDeliveryFindOne = jest.fn();

const mockAxiosGet = jest.fn();
const mockJwtSign = jest.fn();

jest.unstable_mockModule("../app/modules/otp/otp.model.js", () => ({
  default: {
    deleteMany: mockOtpDeleteMany,
    create: mockOtpCreate,
    deleteOne: mockOtpDeleteOne,
    findOne: mockOtpFindOne,
  },
}));

jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: { findOne: mockAdminFindOne },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: { findOne: mockSellerFindOne },
}));

jest.unstable_mockModule("../app/models/customer.js", () => ({
  default: { findOne: mockCustomerFindOne },
}));

jest.unstable_mockModule("../app/models/delivery.js", () => ({
  default: { findOne: mockDeliveryFindOne },
}));

jest.unstable_mockModule("axios", () => ({
  default: { get: mockAxiosGet },
}));

jest.unstable_mockModule("jsonwebtoken", () => ({
  default: { sign: mockJwtSign },
}));

const { sendSmsOtp, verifySmsOtp, __testables } = await import(
  "../app/modules/otp/otp.service.js"
);

function makeSession({
  otpHash,
  expiresAt = new Date(Date.now() + 5 * 60 * 1000),
  attempts = 0,
  maxAttempts = 5,
} = {}) {
  return {
    _id: "otp-session-id",
    otpHash,
    expiresAt,
    attempts,
    maxAttempts,
    save: jest.fn().mockResolvedValue({}),
  };
}

describe("sms OTP service", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.JWT_SECRET = "test-secret";
    process.env.JWT_EXPIRES_IN = "7d";
    process.env.OTP_EXPIRY_MINUTES = "5";
    process.env.OTP_LENGTH = "4";
    process.env.OTP_MAX_FAILED_ATTEMPTS = "5";
    process.env.USE_MOCK_OTP = "true";
    process.env.USE_REAL_SMS = "false";
    process.env.NODE_ENV = "test";
    delete process.env.SMS_INDIA_HUB_API_KEY;
    delete process.env.SMS_INDIA_HUB_SENDER_ID;
    delete process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID;
    delete process.env.SMS_INDIA_HUB_URL;
  });

  it("sends OTP in mock mode, replaces older OTP, and skips SMS provider", async () => {
    mockCustomerFindOne.mockResolvedValue({
      _id: "customer-1",
      phone: "+919876543210",
    });
    mockOtpCreate.mockResolvedValue({});

    const result = await sendSmsOtp({
      mobile: "9876543210",
      userType: "Customer",
      purpose: "LOGIN",
      ipAddress: "127.0.0.1",
    });

    expect(mockOtpDeleteMany).toHaveBeenCalledWith({
      mobile: "9876543210",
      userType: "Customer",
      purpose: "LOGIN",
    });
    expect(mockOtpCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        mobile: "9876543210",
        userType: "Customer",
        purpose: "LOGIN",
        otpHash: expect.any(String),
        expiresAt: expect.any(Date),
        maxAttempts: 5,
      }),
    );
    expect(mockAxiosGet).not.toHaveBeenCalled();
    expect(result.sent).toBe(true);
    expect(result.provider).toBe("mock");
    expect(result.mockOtp).toMatch(/^\d{4}$/);
  });

  it("fails real SMS send when provider returns a DLT template error", async () => {
    process.env.USE_MOCK_OTP = "false";
    process.env.USE_REAL_SMS = "true";
    process.env.SMS_INDIA_HUB_API_KEY = "api";
    process.env.SMS_INDIA_HUB_SENDER_ID = "SENDER";
    process.env.SMS_INDIA_HUB_DLT_TEMPLATE_ID = "template";
    process.env.SMS_INDIA_HUB_URL = "http://cloud.smsindiahub.in/vendorsms/pushsms.aspx";

    mockSellerFindOne.mockResolvedValue({ _id: "seller-1", phone: "9876543210" });
    mockAxiosGet.mockResolvedValue({ data: "006|Template error" });

    await expect(
      sendSmsOtp({
        mobile: "9876543210",
        userType: "Seller",
        purpose: "LOGIN",
      }),
    ).rejects.toMatchObject({
      message: "SMS India HUB DLT template mismatch",
      providerCode: "006",
    });
  });

  it("verifies a valid login OTP, deletes the session, and returns a JWT", async () => {
    const otpHash = __testables.hashOtp("9876543210", "1234", "Customer", "LOGIN");
    const session = makeSession({ otpHash });
    const mockSelect = jest.fn().mockResolvedValue(session);
    const customer = {
      _id: "customer-1",
      phone: "+919876543210",
      isVerified: false,
      save: jest.fn().mockResolvedValue({}),
      toObject: () => ({
        _id: "customer-1",
        phone: "+919876543210",
        isVerified: true,
      }),
    };

    mockOtpFindOne.mockReturnValue({ select: mockSelect });
    mockCustomerFindOne
      .mockResolvedValueOnce(customer)
      .mockResolvedValueOnce(customer);
    mockJwtSign.mockReturnValue("signed-token");

    const result = await verifySmsOtp({
      mobile: "9876543210",
      otp: "1234",
      userType: "Customer",
      purpose: "LOGIN",
      ipAddress: "127.0.0.1",
    });

    expect(session.save).toHaveBeenCalled();
    expect(mockOtpDeleteOne).toHaveBeenCalledWith({ _id: "otp-session-id" });
    expect(customer.save).toHaveBeenCalled();
    expect(mockJwtSign).toHaveBeenCalledWith(
      { id: "customer-1", role: "customer" },
      "test-secret",
      { expiresIn: "7d" },
    );
    expect(result.verified).toBe(true);
    expect(result.token).toBe("signed-token");
    expect(result.account).toEqual(
      expect.objectContaining({
        _id: "customer-1",
        phone: "+919876543210",
      }),
    );
  });

  it("rejects expired OTPs and removes the stale session", async () => {
    const session = makeSession({
      otpHash: "deadbeef",
      expiresAt: new Date(Date.now() - 1000),
    });
    const mockSelect = jest.fn().mockResolvedValue(session);

    mockOtpFindOne.mockReturnValue({ select: mockSelect });

    await expect(
      verifySmsOtp({
        mobile: "9876543210",
        otp: "1234",
        userType: "Customer",
        purpose: "LOGIN",
      }),
    ).rejects.toMatchObject({
      message: "OTP has expired",
      statusCode: 400,
    });

    expect(mockOtpDeleteOne).toHaveBeenCalledWith({ _id: "otp-session-id" });
  });

  it("increments attempts for wrong OTPs and reports attempts remaining", async () => {
    const session = makeSession({
      otpHash: __testables.hashOtp("9876543210", "1234", "Customer", "LOGIN"),
      attempts: 1,
      maxAttempts: 5,
    });
    const mockSelect = jest.fn().mockResolvedValue(session);

    mockOtpFindOne.mockReturnValue({ select: mockSelect });

    await expect(
      verifySmsOtp({
        mobile: "9876543210",
        otp: "9999",
        userType: "Customer",
        purpose: "LOGIN",
      }),
    ).rejects.toMatchObject({
      message: "Invalid OTP",
      statusCode: 400,
      attemptsRemaining: 3,
    });

    expect(session.attempts).toBe(2);
    expect(session.save).toHaveBeenCalled();
    expect(mockOtpDeleteOne).not.toHaveBeenCalled();
  });

  it("locks out verification after the final wrong attempt by deleting the session", async () => {
    const session = makeSession({
      otpHash: __testables.hashOtp("9876543210", "1234", "Customer", "LOGIN"),
      attempts: 4,
      maxAttempts: 5,
    });
    const mockSelect = jest.fn().mockResolvedValue(session);

    mockOtpFindOne.mockReturnValue({ select: mockSelect });

    await expect(
      verifySmsOtp({
        mobile: "9876543210",
        otp: "9999",
        userType: "Customer",
        purpose: "LOGIN",
      }),
    ).rejects.toMatchObject({
      message: "Maximum OTP verification attempts exceeded",
      statusCode: 429,
    });

    expect(mockOtpDeleteOne).toHaveBeenCalledWith({ _id: "otp-session-id" });
  });
});
