import Admin from "../models/admin.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";

/* ===============================
   Utils
================================ */

const generateToken = (admin) =>
    jwt.sign(
        { id: admin._id, role: "admin" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

/* ===============================
   ADMIN SIGNUP
================================ */
export const signupAdmin = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return handleResponse(res, 400, "Name, email and password are required");
        }

        let admin = await Admin.findOne({ email });

        if (admin) {
            return handleResponse(res, 400, "Admin already exists");
        }

        admin = await Admin.create({
            name,
            email,
            password,
        });

        const token = generateToken(admin);

        return handleResponse(res, 201, "Admin registered successfully", {
            token,
            admin,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   ADMIN LOGIN
================================ */
export const loginAdmin = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return handleResponse(res, 400, "Email and password are required");
        }

        const admin = await Admin.findOne({ email }).select("+password");

        if (!admin) {
            return handleResponse(res, 404, "Admin not found");
        }

        const isMatch = await admin.comparePassword(password);

        if (!isMatch) {
            return handleResponse(res, 401, "Invalid credentials");
        }

        admin.lastLogin = new Date();
        await admin.save();

        const token = generateToken(admin);

        return handleResponse(res, 200, "Login successful", {
            token,
            admin,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};