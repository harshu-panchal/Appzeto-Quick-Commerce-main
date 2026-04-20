import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Delivery from './app/models/delivery.js';

dotenv.config();

const verifyStatus = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const rider = await Delivery.findOne({ phone: "6263514141" });
        if (rider) {
            console.log(`Rider: ${rider.name}, Verified: ${rider.isVerified}`);
        } else {
            console.log("Rider not found");
        }
        await mongoose.disconnect();
    } catch (err) {
        console.error(err);
    }
};

verifyStatus();
