import mongoose from "mongoose";
import dotenv from "dotenv";
import Transaction from "./app/models/transaction.js";
import Delivery from "./app/models/delivery.js";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/quick-commerce";

async function checkCashEntries() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        // 1. Get all Cash Collection transactions
        const cashCollections = await Transaction.find({ type: "Cash Collection" });
        console.log(`\nFound ${cashCollections.length} Cash Collection transactions.`);

        if (cashCollections.length > 0) {
            cashCollections.forEach(t => {
                console.log(`- Amount: ₹${t.amount} | Rider: ${t.user} | Reference: ${t.reference}`);
            });
        }

        // 2. Get all riders shown in screenshot (if I can guess IDs or names)
        const names = ["Chirag", "abc", "ashutosh", "ashu", "priyank"];
        const riders = await Delivery.find({ name: { $in: names } });

        console.log(`\nFound ${riders.length} riders from the screenshot list:`);
        for (const rider of riders) {
            const count = await Transaction.countDocuments({ user: rider._id, type: "Cash Collection" });
            console.log(`- ${rider.name} (${rider._id}): ${count} collections`);
        }

        await mongoose.disconnect();
        console.log("\nDisconnected from MongoDB");
    } catch (error) {
        console.error("Error:", error);
    }
}

checkCashEntries();
