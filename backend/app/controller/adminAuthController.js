import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import {
  bootstrapAdminSchema,
  loginAdminSchema,
  validateSchema,
} from "../validation/adminAuthValidation.js";

const PUBLIC_ADMIN_SIGNUP_ENABLED = () =>
  process.env.ENABLE_PUBLIC_ADMIN_SIGNUP === "true";

function sanitizeAdmin(adminDoc) {
  const admin = adminDoc?.toObject ? adminDoc.toObject() : { ...(adminDoc || {}) };
  delete admin.password;
  delete admin.__v;
  return admin;
}

const generateToken = (admin) =>
  jwt.sign(
    { id: admin._id, role: "admin" },
    process.env.JWT_SECRET,
    { expiresIn: "7d" },
  );

function readBootstrapSecret(req) {
  return String(
    req.headers["x-admin-bootstrap-secret"] ||
      req.body?.adminSecret ||
      "",
  ).trim();
}

export const bootstrapAdmin = async (req, res) => {
  try {
    const configuredSecret = String(process.env.ADMIN_BOOTSTRAP_SECRET || "").trim();
    if (!configuredSecret) {
      return handleResponse(res, 503, "Admin bootstrap is not configured");
    }

    const suppliedSecret = readBootstrapSecret(req);
    if (!suppliedSecret || suppliedSecret !== configuredSecret) {
      return handleResponse(res, 403, "Invalid admin bootstrap secret");
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 409, "Admin bootstrap is disabled after initial setup");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const duplicate = await Admin.findOne({ email: payload.email }).lean();
    if (duplicate) {
      return handleResponse(res, 409, "Admin already exists");
    }

    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isVerified: true,
    });

    const token = generateToken(admin);
    return handleResponse(res, 201, "Admin bootstrapped successfully", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const signupAdmin = async (req, res) => {
  try {
    if (!PUBLIC_ADMIN_SIGNUP_ENABLED()) {
      return handleResponse(
        res,
        403,
        "Public admin signup is disabled. Use secure bootstrap flow.",
      );
    }

    const existingCount = await Admin.countDocuments({});
    if (existingCount > 0) {
      return handleResponse(res, 403, "Public admin signup is disabled after bootstrap");
    }

    const payload = validateSchema(bootstrapAdminSchema, req.body || {});
    const admin = await Admin.create({
      name: payload.name,
      email: payload.email,
      password: payload.password,
      role: "admin",
      isVerified: true,
    });

    const token = generateToken(admin);
    return handleResponse(res, 201, "Admin registered successfully", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const payload = validateSchema(loginAdminSchema, req.body || {});

    const admin = await Admin.findOne({ email: payload.email }).select("+password");
    if (!admin) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    const isMatch = await admin.comparePassword(payload.password);
    if (!isMatch) {
      return handleResponse(res, 401, "Invalid credentials");
    }

    admin.lastLogin = new Date();
    await admin.save();

    const token = generateToken(admin);
    return handleResponse(res, 200, "Login successful", {
      token,
      admin: sanitizeAdmin(admin),
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
