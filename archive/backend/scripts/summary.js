
import mongoose from "mongoose";
import dotenv from "dotenv";
import Order from "../app/models/order.js";
import Delivery from "../app/models/delivery.js";

dotenv.config();

const run = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        const orders = await Order.countDocuments({
            status: { $in: ["confirmed", "packed"] },
            deliveryBoy: null
        });
        const onlineRiders = await Delivery.countDocuments({ isOnline: true });

        console.log("--------------- SUMMARY ---------------");
        console.log("Confirmed/Packed Orders (Unassigned):", orders);
        console.log("Online Delivery Partners:", onlineRiders);
        console.log("---------------------------------------");

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
};

run();
