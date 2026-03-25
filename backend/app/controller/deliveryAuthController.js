import Delivery from "../models/delivery.js";
import jwt from "jsonwebtoken";
import handleResponse from "../utils/helper.js";
import { uploadToCloudinary } from "../utils/cloudinary.js";
import { generateOTP, useRealSMS } from "../utils/otp.js";

const generateToken = (delivery) =>
    jwt.sign(
        { id: delivery._id, role: "delivery" },
        process.env.JWT_SECRET,
        { expiresIn: "7d" }
    );

/* ===============================
   SIGNUP – Send OTP
================================ */
export const signupDelivery = async (req, res) => {
    try {
        const {
            name, phone, vehicleType,
            email, address, vehicleNumber,
            drivingLicenseNumber,
            accountHolder, accountNumber, ifsc
        } = req.body;

        if (!name || !phone) {
            return handleResponse(res, 400, "Name and phone are required");
        }

        let delivery = await Delivery.findOne({ phone });

        if (delivery && delivery.isVerified) {
            return handleResponse(res, 400, "Delivery partner already exists");
        }

        const otp = generateOTP();

        let aadharUrl = delivery?.documents?.aadhar || "";
        let panUrl = delivery?.documents?.pan || "";
        let dlUrl = delivery?.documents?.drivingLicense || "";

        if (req.files) {
            if (req.files.aadhar && req.files.aadhar[0]) {
                aadharUrl = await uploadToCloudinary(req.files.aadhar[0].buffer, 'delivery_docs');
            }
            if (req.files.pan && req.files.pan[0]) {
                panUrl = await uploadToCloudinary(req.files.pan[0].buffer, 'delivery_docs');
            }
            if (req.files.dl && req.files.dl[0]) {
                dlUrl = await uploadToCloudinary(req.files.dl[0].buffer, 'delivery_docs');
            }
        }

        const deliveryData = {
            name,
            phone,
            vehicleType,
            email,
            address,
            vehicleNumber,
            drivingLicenseNumber,
            accountHolder,
            accountNumber,
            ifsc,
            documents: {
                aadhar: aadharUrl,
                pan: panUrl,
                drivingLicense: dlUrl,
            },
            otp,
            otpExpiry: Date.now() + 5 * 60 * 1000,
        };

        if (!delivery) {
            delivery = await Delivery.create(deliveryData);
        } else {
            Object.assign(delivery, deliveryData);
            await delivery.save();
        }

        console.log("-------------------");
        console.log("Delivery Signup Request Received");
        console.log("Data:", { name, phone, vehicleType, email });
        if (useRealSMS()) {
            console.log("Generated OTP (real SMS mode):", otp);
        } else {
            console.log("OTP (mock mode): use 1234");
        }
        console.log("-------------------");

        return handleResponse(res, 200, "OTP sent successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   LOGIN – Send OTP
================================ */
export const loginDelivery = async (req, res) => {
    try {
        const { phone } = req.body;

        if (!phone) {
            return handleResponse(res, 400, "Phone number is required");
        }

        const delivery = await Delivery.findOne({ phone });

        if (!delivery || !delivery.isVerified) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        const otp = generateOTP();

        delivery.otp = otp;
        delivery.otpExpiry = Date.now() + 5 * 60 * 1000;
        await delivery.save();

        console.log("-------------------");
        console.log("Delivery Login Request Received");
        console.log("Phone:", phone);
        if (useRealSMS()) {
            console.log("Generated OTP (real SMS mode):", otp);
        } else {
            console.log("OTP (mock mode): use 1234");
        }
        console.log("-------------------");

        return handleResponse(res, 200, "OTP sent successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   VERIFY OTP
================================ */
export const verifyDeliveryOTP = async (req, res) => {
    try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
            return handleResponse(res, 400, "Phone and OTP are required");
        }

        const delivery = await Delivery.findOne({
            phone,
            otp,
            otpExpiry: { $gt: Date.now() },
        });

        if (!delivery) {
            return handleResponse(res, 400, "Invalid or expired OTP");
        }

        delivery.isVerified = true;
        delivery.isOnline = true; // Auto-activate delivery boy on login
        delivery.otp = undefined;
        delivery.otpExpiry = undefined;
        delivery.lastLogin = new Date();

        await delivery.save();

        const token = generateToken(delivery);

        return handleResponse(res, 200, "Login successful", {
            token,
            delivery,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET PROFILE
================================ */
export const getDeliveryProfile = async (req, res) => {
    try {
        const delivery = await Delivery.findById(req.user.id);
        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }
        return handleResponse(res, 200, "Profile fetched successfully", delivery);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE PROFILE
================================ */
export const updateDeliveryProfile = async (req, res) => {
    try {
        const { name, vehicleType, vehicleNumber, drivingLicenseNumber, currentArea, isOnline } = req.body;

        const delivery = await Delivery.findById(req.user.id);
        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        if (name) delivery.name = name;
        if (vehicleType) delivery.vehicleType = vehicleType;
        if (vehicleNumber) delivery.vehicleNumber = vehicleNumber;
        if (drivingLicenseNumber) delivery.drivingLicenseNumber = drivingLicenseNumber;
        if (currentArea) delivery.currentArea = currentArea;
        if (typeof isOnline !== 'undefined') delivery.isOnline = isOnline;

        await delivery.save();

        return handleResponse(res, 200, "Profile updated successfully", delivery);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};