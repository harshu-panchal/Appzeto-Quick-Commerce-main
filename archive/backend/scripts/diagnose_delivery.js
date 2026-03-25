
import mongoose from "mongoose";
import dotenv from "dotenv";
import Seller from "../app/models/seller.js";
import Delivery from "../app/models/delivery.js";
import Order from "../app/models/order.js";

dotenv.config();

const diagnose = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to DB");

        const now = new Date();
        console.log("Current Time:", now.toISOString());

        // Check Orders
        const confirmedOrders = await Order.find({ status: { $in: ["confirmed", "packed"] } });
        console.log("\n--- ORDERS (Confirmed/Packed) ---");
        console.log("Count:", confirmedOrders.length);
        confirmedOrders.forEach(o => {
            console.log(`Order: ${o.orderId}, Status: ${o.status}, DeliveryBoy: ${o.deliveryBoy || 'None'}`);
        });

        // Check Sellers
        const sellers = await Seller.find({});
        console.log("\n--- SELLERS ---");
        console.log("Count:", sellers.length);

        // Check Delivery Partners
        const partners = await Delivery.find({});
        console.log("\n--- DELIVERY PARTNERS ---");
        partners.forEach(p => {
            console.log(`Partner: ${p.name} (${p.phone}), ID: ${p._id}, Online: ${p.isOnline}, Location: ${JSON.stringify(p.location)}`);
        });

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
};

diagnose();
