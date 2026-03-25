import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Delivery from './app/models/delivery.js';
import Transaction from './app/models/transaction.js';
import connectDB from './app/dbConfig/dbConfig.js';

dotenv.config();

async function addFunds() {
    await connectDB();

    const phone = "6263514141";
    const amount = 500;

    try {
        const deliveryBoy = await Delivery.findOne({ phone });

        if (!deliveryBoy) {
            console.error(`Delivery boy with phone ${phone} not found`);
            process.exit(1);
        }

        console.log(`Found delivery boy: ${deliveryBoy.name} (${deliveryBoy._id})`);

        const transaction = await Transaction.create({
            user: deliveryBoy._id,
            userModel: "Delivery",
            type: "Delivery Earning",
            amount: amount,
            status: "Settled",
            reference: `TEST-ADD-${Date.now()}`
        });

        console.log(`Successfully added ₹${amount} to ${deliveryBoy.name}'s balance.`);
        console.log(`Transaction ID: ${transaction._id}`);

    } catch (error) {
        console.error("Error adding funds:", error);
    } finally {
        await mongoose.connection.close();
        process.exit(0);
    }
}

addFunds();
