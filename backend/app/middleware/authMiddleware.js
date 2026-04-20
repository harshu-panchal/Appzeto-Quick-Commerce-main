import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import Seller from "../models/seller.js";

function extractJwtFromHeaders(req) {
  const authHeader = String(req.headers.authorization || "").trim();
  if (authHeader) {
    const parts = authHeader.split(/\s+/);
    if (parts.length >= 2 && /^bearer$/i.test(parts[0])) {
      return parts[1];
    }

    // Allow raw JWT in Authorization header for non-standard clients.
    // Still requires signature verification so it doesn't weaken auth.
    if (authHeader.split(".").length === 3) {
      return authHeader;
    }
  }

  const xAccessToken = String(req.headers["x-access-token"] || "").trim();
  if (xAccessToken && xAccessToken.split(".").length === 3) {
    return xAccessToken;
  }

  return null;
}

/* ===============================
   Verify Token
================================ */
export const verifyToken = (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);

    if (!token) {
      return handleResponse(res, 401, "Unauthorized, token missing");
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    req.user = decoded; // { id, role }
    next();
  } catch (error) {
    return handleResponse(res, 401, "Invalid or expired token");
  }
};

/* ===============================
   Optional Verify Token (for public routes that need user context)
================================ */
export const optionalVerifyToken = (req, res, next) => {
  try {
    const token = extractJwtFromHeaders(req);

    if (token) {
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // { id, role }
      } catch (error) {
        // Token is invalid, but we don't block the request
        req.user = null;
      }
    }

    next();
  } catch (error) {
    // Don't block the request, just continue without user
    next();
  }
};

/* ===============================
   Role Based Access
================================ */
export const allowRoles = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return handleResponse(res, 403, "Access denied");
    }
    next();
  };
};

/* ===============================
   Ensure seller can access seller-only operational routes
================================ */
export const requireApprovedSeller = async (req, res, next) => {
  try {
    if (req.user?.role !== "seller") {
      return next();
    }

    const seller = await Seller.findById(req.user.id)
      .select("isVerified isActive applicationStatus rejectionReason")
      .lean();

    if (!seller) {
      return handleResponse(res, 401, "Seller account not found");
    }

    const applicationStatus =
      seller.applicationStatus || (seller.isVerified ? "approved" : "pending");
    const isApproved =
      seller.isVerified === true &&
      seller.isActive === true &&
      applicationStatus === "approved";

    if (!isApproved) {
      const message =
        applicationStatus === "rejected"
          ? "Seller application rejected. Please contact admin support."
          : "Seller account is pending admin approval.";

      return handleResponse(res, 403, message, {
        applicationStatus,
        isVerified: seller.isVerified === true,
        isActive: seller.isActive === true,
        rejectionReason: seller.rejectionReason || "",
      });
    }

    next();
  } catch (error) {
    return handleResponse(res, 500, "Unable to validate seller approval status");
  }
};
