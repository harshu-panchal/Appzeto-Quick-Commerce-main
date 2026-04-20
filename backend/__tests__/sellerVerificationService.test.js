import { jest } from "@jest/globals";

const mockSendMail = jest.fn();
const mockCreateTransport = jest.fn(() => ({
  sendMail: mockSendMail,
}));
const mockSellerFindOne = jest.fn();
const mockGetRedisClient = jest.fn();
const mockSendSmsIndiaHubOtp = jest.fn();

let otpSessions;

class MockOtpVerification {
  constructor(data) {
    Object.assign(this, data);
    this._id = this._id || `${this.channel}:${this.target}`;
  }

  static findOne(query) {
    const key = `${query.purpose}:${query.channel}:${query.target}`;
    const session = otpSessions.get(key);

    return {
      select: jest.fn().mockResolvedValue(session || null),
    };
  }

  static async deleteOne(query) {
    for (const [key, value] of otpSessions.entries()) {
      if (String(value._id) === String(query._id)) {
        otpSessions.delete(key);
      }
    }
  }

  async save() {
    const key = `${this.purpose}:${this.channel}:${this.target}`;
    otpSessions.set(key, this);
    return this;
  }
}

jest.unstable_mockModule("nodemailer", () => ({
  default: {
    createTransport: mockCreateTransport,
  },
}));

jest.unstable_mockModule("../app/models/seller.js", () => ({
  default: {
    findOne: mockSellerFindOne,
  },
}));

jest.unstable_mockModule("../app/models/otpVerification.js", () => ({
  default: MockOtpVerification,
}));

jest.unstable_mockModule("../app/config/redis.js", () => ({
  getRedisClient: mockGetRedisClient,
}));

jest.unstable_mockModule("../app/services/smsIndiaHubService.js", () => ({
  sendSmsIndiaHubOtp: mockSendSmsIndiaHubOtp,
}));

const sellerVerificationService = await import(
  "../app/services/sellerVerificationService.js"
);
const emailService = await import("../app/services/emailService.js");

const {
  issueSellerVerificationOtp,
  verifySellerOtpCode,
  verifySellerVerificationToken,
} = sellerVerificationService;

describe("sellerVerificationService", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Math, "random").mockReturnValue(0.026);
    otpSessions = new Map();
    mockSellerFindOne.mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(null),
      }),
    });
    mockGetRedisClient.mockReturnValue(null);
    emailService.__resetEmailTransportForTests();

    process.env.NODE_ENV = "test";
    process.env.JWT_SECRET = "test-jwt-secret";
    process.env.OTP_HASH_SECRET = "test-otp-secret";
    process.env.USE_REAL_EMAIL_OTP = "true";
    process.env.SMTP_HOST = "smtp.example.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_USER = "smtp-user";
    process.env.SMTP_PASS = "smtp-pass";
    process.env.MAIL_FROM = "no-reply@example.com";
    process.env.MAIL_FROM_NAME = "Noyo";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("sends seller email OTP through nodemailer and stores the session", async () => {
    const result = await issueSellerVerificationOtp({
      channel: "email",
      rawValue: "seller@example.com",
      ipAddress: "127.0.0.1",
    });

    expect(result).toEqual(
      expect.objectContaining({
        sent: true,
        channel: "email",
        maskedTarget: "se***@example.com",
      }),
    );
    expect(mockCreateTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "smtp.example.com",
        port: 587,
        secure: false,
        auth: {
          user: "smtp-user",
          pass: "smtp-pass",
        },
      }),
    );
    expect(mockSendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "Noyo <no-reply@example.com>",
        to: "seller@example.com",
        subject: "Verify your seller signup email",
      }),
    );

    const session = otpSessions.get("seller_signup:email:seller@example.com");
    expect(session).toBeTruthy();
    expect(session.verifiedAt).toBeNull();
  });

  it("verifies the email OTP and returns a verification token that matches signup details", async () => {
    await issueSellerVerificationOtp({
      channel: "email",
      rawValue: "seller@example.com",
      ipAddress: "127.0.0.1",
    });

    const verification = await verifySellerOtpCode({
      channel: "email",
      rawValue: "seller@example.com",
      otp: "1234",
      ipAddress: "127.0.0.1",
    });

    expect(verification).toEqual(
      expect.objectContaining({
        verified: true,
        channel: "email",
        verificationToken: expect.any(String),
      }),
    );

    expect(() =>
      verifySellerVerificationToken({
        channel: "email",
        rawValue: "seller@example.com",
        token: verification.verificationToken,
      }),
    ).not.toThrow();
  });

  it("rejects signup token validation when email details do not match the verified OTP", async () => {
    await issueSellerVerificationOtp({
      channel: "email",
      rawValue: "seller@example.com",
      ipAddress: "127.0.0.1",
    });

    const verification = await verifySellerOtpCode({
      channel: "email",
      rawValue: "seller@example.com",
      otp: "1234",
      ipAddress: "127.0.0.1",
    });

    expect(() =>
      verifySellerVerificationToken({
        channel: "email",
        rawValue: "other@example.com",
        token: verification.verificationToken,
      }),
    ).toThrow("Verification does not match the provided details");
  });
});
