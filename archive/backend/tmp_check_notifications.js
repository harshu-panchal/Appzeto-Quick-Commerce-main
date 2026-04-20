import mongoose from "mongoose";
import dotenv from "dotenv";
import Notification from "./app/models/notification.js";
import Order from "./app/models/order.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/quick-commerce";

async function checkNotifications() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // 1. Get latest 5 notifications
        const notifs = await Notification.find({})
            .sort({ createdAt: -1 })
            .limit(5);

        console.log("\n--- Latest 5 Notifications ---");
        notifs.forEach(n => {
            console.log(`[${n.createdAt.toLocaleString()}] To: ${n.recipientModel} (${n.recipient}) | Title: ${n.title} | Message: ${n.message}`);
        });

        // 2. Get latest 5 orders
        const orders = await Order.find({})
            .sort({ createdAt: -1 })
            .limit(5);

        console.log("\n--- Latest 5 Orders ---");
        orders.forEach(o => {
            console.log(`[${o.createdAt.toLocaleString()}] ID: ${o.orderId} | Status: ${o.status} | Seller: ${o.seller}`);
        });

        await mongoose.disconnect();
        console.log("\nDisconnected from MongoDB");
    } catch (error) {
        console.error("Error:", error);
    }
}

checkNotifications();
