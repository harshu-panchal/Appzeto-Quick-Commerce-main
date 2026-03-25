import Customer from "../models/customer.js";
import Transaction from "../models/transaction.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import { generateOTP, useRealSMS } from "../utils/otp.js";

const generateToken = (customer) =>
    jwt.sign(
        { id: customer._id, role: "customer" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

/* ===============================
   SIGNUP – Send OTP
================================ */
export const signupCustomer = async (req, res) => {
    try {
        const { name, phone } = req.body;

        if (!name || !phone) {
            return handleResponse(
                res,
                400,
                "Name and phone number are required"
            );
        }

        let customer = await Customer.findOne({ phone });

        if (customer && customer.isVerified) {
            return handleResponse(
                res,
                400,
                "Customer already exists, please login"
            );
        }

        const otp = generateOTP();

        if (!customer) {
            customer = await Customer.create({
                name,
                phone,
                otp,
                otpExpiry: Date.now() + 5 * 60 * 1000,
            });
        } else {
            customer.otp = otp;
            customer.otpExpiry = Date.now() + 5 * 60 * 1000;
            await customer.save();
        }

        if (useRealSMS()) {
            // TODO: Send OTP via SMS (Twilio/SMS India Hub)
            console.log("Signup OTP (real SMS mode):", otp);
        } else {
            console.log("Signup OTP (mock mode): use 1234");
        }

        return handleResponse(
            res,
            200,
            "OTP sent successfully"
        );
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   LOGIN – Send OTP
================================ */
export const loginCustomer = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return handleResponse(
                res,
                400,
                "Phone number is required"
            );
        }

        const customer = await Customer.findOne({ phone });

        if (!customer || !customer.isVerified) {
            return handleResponse(
                res,
                404,
                "Customer not found, please signup"
            );
        }

        const otp = generateOTP();

        customer.otp = otp;
        customer.otpExpiry = Date.now() + 5 * 60 * 1000;
        await customer.save();

        if (useRealSMS()) {
            // TODO: Send OTP via SMS (Twilio/SMS India Hub)
            console.log("Login OTP (real SMS mode):", otp);
        } else {
            console.log("Login OTP (mock mode): use 1234");
        }

        return handleResponse(
            res,
            200,
            "OTP sent successfully"
        );
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   VERIFY OTP – Login / Signup
================================ */
export const verifyCustomerOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return handleResponse(
                res,
                400,
                "Phone and OTP are required"
            );
        }

        const customer = await Customer.findOne({
            phone,
            otp,
            otpExpiry: { $gt: Date.now() },
        });

        if (!customer) {
            return handleResponse(
                res,
                400,
                "Invalid or expired OTP"
            );
        }

        customer.isVerified = true;
        customer.otp = undefined;
        customer.otpExpiry = undefined;
        customer.lastLogin = new Date();

        await customer.save();

        const token = generateToken(customer);

        return handleResponse(
            res,
            200,
            "Login successful",
            {
                token,
                customer,
            }
        );
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET PROFILE
================================ */
export const getCustomerProfile = async (req, res) => {
    try {
        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }
        return handleResponse(res, 200, "Profile fetched successfully", customer);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE PROFILE
================================ */
export const updateCustomerProfile = async (req, res) => {
    try {
        const { name, email, addresses } = req.body;

        const customer = await Customer.findById(req.user.id);
        if (!customer) {
            return handleResponse(res, 404, "Customer not found");
        }

        if (name) customer.name = name;
        if (email) customer.email = email;
        if (addresses) customer.addresses = addresses;

        await customer.save();

        return handleResponse(res, 200, "Profile updated successfully", customer);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET WALLET TRANSACTIONS
================================ */
export const getCustomerTransactions = async (req, res) => {
    try {
        const customerId = req.user.id;
        const { page = 1, limit = 20 } = req.query;
        const skip = (Math.max(1, parseInt(page, 10)) - 1) * Math.min(50, Math.max(1, parseInt(limit, 10)));
        const perPage = Math.min(50, Math.max(1, parseInt(limit, 10)));

        const [transactions, total] = await Promise.all([
            Transaction.find({ user: customerId, userModel: "User" })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(perPage)
                .populate("order", "orderId")
                .lean(),
            Transaction.countDocuments({ user: customerId, userModel: "User" }),
        ]);

        const items = transactions.map((t) => ({
            _id: t._id,
            type: t.type === "Refund" ? "credit" : "debit",
            title: t.type === "Refund" ? "Refund" : t.type,
            amount: Math.abs(t.amount),
            date: t.createdAt,
            reference: t.reference,
            orderId: t.order?.orderId,
        }));

        return handleResponse(res, 200, "Transactions fetched", {
            items,
            total,
            page: parseInt(page, 10),
            totalPages: Math.ceil(total / perPage) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};