import mongoose from "mongoose";
import { normalizePhoneNumber } from "../utils/phone.js";

const addressSchema = new mongoose.Schema({
    label: {
        type: String,
        enum: ["home", "work", "other"],
        default: "home",
    },
    fullAddress: {
        type: String,
        required: true,
    },
    formattedAddress: String,
    placeId: String,
    landmark: String,
    city: String,
    state: String,
    pincode: String,
    location: {
        lat: Number,
        lng: Number,
    },
});

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            trim: true,
        },

        email: {
            type: String,
            lowercase: true,
            unique: true,
            sparse: true, // phone login users ke liye
        },

        phone: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        password: {
            type: String,
            select: false, // response me password na aaye
        },

        role: {
            type: String,
            enum: ["user", "admin", "delivery", "seller"],
            default: "user",
        },

        isVerified: {
            type: Boolean,
            default: false,
        },

        otp: {
            type: String,
            select: false,
        },

        otpExpiry: {
            type: Date,
            select: false,
        },

        otpHash: {
            type: String,
            select: false,
        },

        otpExpiresAt: {
            type: Date,
            select: false,
        },

        otpFailedAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

        otpLockedUntil: {
            type: Date,
            select: false,
        },

        otpLastSentAt: {
            type: Date,
            select: false,
        },

        otpSessionVersion: {
            type: Number,
            default: 0,
            select: false,
        },

        addresses: [addressSchema],

        walletBalance: {
            type: Number,
            default: 0,
        },

        isActive: {
            type: Boolean,
            default: true,
        },

        lastLogin: Date,
    },
    {
        timestamps: true,
    }
);

userSchema.index({ role: 1, isActive: 1 });

userSchema.pre("validate", function(next) {
    if (this.phone) {
        this.phone = normalizePhoneNumber(this.phone);
    }
    next();
});

export default mongoose.model("User", userSchema);
