
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './app/models/order.js';

dotenv.config();

async function checkOrders() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log('Connected to DB');
        
        const count = await Order.countDocuments({});
        console.log('Total Orders:', count);
        
        const delivered = await Order.countDocuments({ status: 'delivered' });
        console.log('Delivered Orders:', delivered);
        
        const last7Days = await Order.find({ 
            createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
            status: 'delivered'
        });
        console.log('Delivered Orders in last 7 days:', last7Days.length);
        
        const recent = await Order.find().sort({ createdAt: -1 }).limit(5);
        console.log('Recent Orders:', recent.map(o => ({ orderId: o.orderId, status: o.status, createdAt: o.createdAt })));

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkOrders();
