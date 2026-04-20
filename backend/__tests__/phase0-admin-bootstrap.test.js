import { jest } from "@jest/globals";

const mockAdminCountDocuments = jest.fn();
const mockAdminFindOne = jest.fn();
const mockAdminCreate = jest.fn();

jest.unstable_mockModule("../app/models/admin.js", () => ({
  default: {
    countDocuments: mockAdminCountDocuments,
    findOne: mockAdminFindOne,
    create: mockAdminCreate,
  },
}));

const { bootstrapAdmin } = await import("../app/controller/adminAuthController.js");

describe("Phase 0 secure admin bootstrap", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.ADMIN_BOOTSTRAP_SECRET = "secret-123";
  });

  it("blocks bootstrap once at least one admin already exists", async () => {
    mockAdminCountDocuments.mockResolvedValue(1);

    const req = {
      headers: {
        "x-admin-bootstrap-secret": "secret-123",
      },
      body: {
        name: "Admin User",
        email: "admin@example.com",
        password: "StrongPass123A",
      },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await bootstrapAdmin(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: "Admin bootstrap is disabled after initial setup",
      }),
    );
    expect(mockAdminCreate).not.toHaveBeenCalled();
  });
});
