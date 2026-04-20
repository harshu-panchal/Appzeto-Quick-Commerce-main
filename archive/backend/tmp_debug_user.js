import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Delivery from './app/models/delivery.js';
import Transaction from './app/models/transaction.js';

dotenv.config();

const debug = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const targetId = "69a2ca1ac48760808ff8ab19"; // From user's log
        const deliveryBoy = await Delivery.findById(targetId);

        if (!deliveryBoy) {
            console.log("Delivery Boy not found with ID:", targetId);
            // Try searching by phone just in case
            const byPhone = await Delivery.findOne({ phone: "6263514141" });
            if (byPhone) {
                console.log("Found by phone instead! ID is:", byPhone._id);
            } else {
                console.log("Not found by phone either.");
            }
        } else {
            console.log("Found Delivery Boy:", deliveryBoy.name, "Phone:", deliveryBoy.phone);

            const transactions = await Transaction.find({ user: deliveryBoy._id, userModel: 'Delivery' });
            console.log("Found", transactions.length, "transactions");
            transactions.forEach(t => {
                console.log(`- Type: ${t.type}, Amount: ${t.amount}, Status: ${t.status}, Ref: ${t.reference}, Date: ${t.createdAt}`);
            });
        }

        await mongoose.disconnect();
    } catch (error) {
        console.error("Debug Error:", error);
    }
};

debug();
