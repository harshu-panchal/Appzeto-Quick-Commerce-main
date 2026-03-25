import mongoose from "mongoose";

const deliverySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        phone: {
            type: String,
            required: true,
            unique: true,
        },

        vehicleType: {
            type: String,
            enum: ["bike", "cycle", "scooter"],
            default: "bike",
        },

        email: {
            type: String,
            trim: true,
        },

        address: {
            type: String,
            trim: true,
        },

        accountHolder: {
            type: String,
            trim: true,
        },

        accountNumber: {
            type: String,
            trim: true,
        },

        ifsc: {
            type: String,
            trim: true,
        },

        documents: {
            aadhar: { type: String },
            pan: { type: String },
            drivingLicense: { type: String },
        },

        vehicleNumber: {
            type: String,
            trim: true,
        },

        drivingLicenseNumber: {
            type: String,
            trim: true,
        },

        currentArea: {
            type: String,
            trim: true,
        },

        isVerified: {
            type: Boolean,
            default: false,
        },



        isOnline: {
            type: Boolean,
            default: true,
        },
        location: {
            type: {
                type: String,
                enum: ["Point"],
                default: "Point",
            },
            coordinates: {
                type: [Number],
                default: [0, 0],
            },
        },
        role: {
            type: String,
            default: "delivery",
        },

        otp: {
            type: String,
            select: false,
        },

        otpExpiry: {
            type: Date,
            select: false,
        },

        lastLogin: Date,

        /** Last GPS fix from POST /delivery/location (for radius matching). */
        lastLocationAt: {
            type: Date,
        },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

deliverySchema.index({ location: "2dsphere" });
deliverySchema.index({ isOnline: 1, isVerified: 1 });
deliverySchema.index({ phone: 1 }, { unique: true });

deliverySchema.virtual('id').get(function () {
    return this._id.toHexString();
});

export default mongoose.model("Delivery", deliverySchema);