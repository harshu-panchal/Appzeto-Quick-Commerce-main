import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Delivery from './app/models/delivery.js';
import Transaction from './app/models/transaction.js';
import Order from './app/models/order.js';

dotenv.config();

const checkData = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const phone = "6263514141";
        const deliveryBoy = await Delivery.findOne({ phone });

        if (!deliveryBoy) {
            console.log("Delivery Boy not found with phone:", phone);
            process.exit(0);
        }

        const dbId = deliveryBoy._id;
        console.log("Delivery Boy ID:", dbId);

        // Check Transactions
        const transactions = await Transaction.find({ user: dbId, userModel: 'Delivery' });
        console.log("\n--- Transactions ---");
        console.log("Total Transactions found:", transactions.length);
        transactions.forEach(t => {
            console.log(`Type: ${t.type}, Amount: ${t.amount}, Status: ${t.status}, Date: ${t.createdAt}`);
        });

        // Check Orders
        const orders = await Order.find({ deliveryBoy: dbId, status: 'delivered' });
        console.log("\n--- Delivered Orders ---");
        console.log("Total Delivered Orders found:", orders.length);
        orders.forEach(o => {
            console.log(`OrderID: ${o.orderId}, Payment Method: ${o.payment?.method}, Total: ${o.pricing?.total}`);
        });

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayTransactions = transactions.filter(t => new Date(t.createdAt) >= today);
        console.log("\n--- Today's Transactions ---");
        console.log("Count:", todayTransactions.length);

        const cashCollected = transactions.reduce((acc, t) => {
            if (t.type === 'Cash Collection') return acc + t.amount;
            if (t.type === 'Cash Settlement') return acc - Math.abs(t.amount);
            return acc;
        }, 0);
        console.log("\nCalculated All-time Cash Collected:", cashCollected);

        const todayEarnings = todayTransactions
            .filter(t => t.status === 'Settled' && (t.type === 'Delivery Earning' || t.type === 'Incentive' || t.type === 'Bonus'))
            .reduce((acc, t) => acc + t.amount, 0);
        console.log("Calculated Today's Earnings:", todayEarnings);

        const incentives = todayTransactions
            .filter(t => t.status === 'Settled' && (t.type === 'Incentive' || t.type === 'Bonus'))
            .reduce((acc, t) => acc + t.amount, 0);
        console.log("Calculated Today's Incentives:", incentives);

        await mongoose.disconnect();
    } catch (error) {
        console.error("Error:", error);
    }
};

checkData();
