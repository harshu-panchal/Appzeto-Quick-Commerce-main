
import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../app/models/order.js";
import Delivery from "../app/models/delivery.js";
import fs from "fs";

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const orders = await Order.countDocuments({
            status: { $in: ["confirmed", "packed"] },
            deliveryBoy: null
        });
        const onlineRiders = await Delivery.countDocuments({ isOnline: true });

        const data = {
            NODE_ENV: process.env.NODE_ENV || "not_set",
            unassignedOrders: orders,
            onlineRiders: onlineRiders,
            timestamp: new Date().toISOString()
        };

        fs.writeFileSync("counts.json", JSON.stringify(data, null, 2));
        console.log("Counts written to counts.json");
        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
