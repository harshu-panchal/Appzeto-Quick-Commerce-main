import Seller from "../models/seller.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";

/* ===============================
   Utils
================================ */

const generateToken = (seller) =>
  jwt.sign({ id: seller._id, role: "seller" }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });

/* ===============================
   SELLER SIGNUP
================================ */
export const signupSeller = async (req, res) => {
    try {
        const {
            name,
            email,
            phone,
            password,
            shopName,
            category,
            description,
            address,
            documents,
            lat,
            lng,
            radius
        } = req.body;

        if (!name || !email || !phone || !password || !shopName) {
            return handleResponse(res, 400, "All fields are required");
        }

        // Validate coordinates and radius if provided
        if (lat !== undefined && (lat < -90 || lat > 90)) {
            return handleResponse(res, 400, "Invalid latitude");
        }
        if (lng !== undefined && (lng < -180 || lng > 180)) {
            return handleResponse(res, 400, "Invalid longitude");
        }
        if (radius !== undefined && (radius < 1 || radius > 100)) {
            return handleResponse(res, 400, "Radius must be between 1 and 100 km");
        }

        let seller = await Seller.findOne({ $or: [{ email }, { phone }] });

        if (seller) {
            return handleResponse(res, 400, "Seller with this email or phone already exists");
        }

        const parsedDocuments =
            typeof documents === "string"
                ? (() => {
                    try {
                        return JSON.parse(documents);
                    } catch {
                        return undefined;
                    }
                })()
                : documents;

        const sellerData = {
            name,
            email,
            phone,
            password,
            shopName,
            category,
            description,
            address,
            documents: parsedDocuments || undefined,
            applicationStatus: "pending",
            isVerified: false,
            isActive: false,
        };

        if (lat !== undefined && lng !== undefined) {
            sellerData.location = {
                type: "Point",
                coordinates: [Number(lng), Number(lat)],
            };
        }

        if (radius !== undefined) {
            sellerData.serviceRadius = Number(radius);
        }

        seller = await Seller.create(sellerData);

        return handleResponse(res, 201, "Seller registered successfully", {
            seller,
            applicationStatus: "pending",
            requiresApproval: true,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   SELLER LOGIN
================================ */
export const loginSeller = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return handleResponse(res, 400, "Email and password are required");
        }

        // Include password for comparison
        const seller = await Seller.findOne({ email }).select("+password");

        if (!seller) {
            return handleResponse(res, 404, "Seller not found");
        }

        const isMatch = await seller.comparePassword(password);

        if (!isMatch) {
            return handleResponse(res, 401, "Invalid credentials");
        }

        const applicationStatus =
            seller.applicationStatus || (seller.isVerified ? "approved" : "pending");
        const isApproved =
            seller.isVerified === true &&
            seller.isActive === true &&
            applicationStatus === "approved";

        if (!isApproved) {
            const approvalMessage =
                applicationStatus === "rejected"
                    ? "Your seller application was rejected. Please contact support."
                    : "Your seller account is pending admin approval.";

            return handleResponse(res, 403, approvalMessage, {
                applicationStatus,
                isVerified: seller.isVerified === true,
                isActive: seller.isActive === true,
                rejectionReason: seller.rejectionReason || "",
            });
        }

        seller.lastLogin = new Date();
        await seller.save();

        const token = generateToken(seller);

        return handleResponse(res, 200, "Login successful", {
            token,
            seller,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
