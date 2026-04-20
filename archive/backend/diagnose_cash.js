import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '.env') });

async function checkData() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("Connected to MongoDB");

        const Transaction = mongoose.model('Transaction', new mongoose.Schema({}, { strict: false }));
        const Delivery = mongoose.model('Delivery', new mongoose.Schema({}, { strict: false }));
        const Order = mongoose.model('Order', new mongoose.Schema({}, { strict: false }));

        const deliveryRiders = await Delivery.find({});
        console.log(`Total Delivery Riders: ${deliveryRiders.length}`);

        for (const rider of deliveryRiders) {
            const txnCount = await Transaction.countDocuments({ user: rider._id, userModel: 'Delivery' });
            const cashTxns = await Transaction.find({ user: rider._id, userModel: 'Delivery', type: { $in: ['Cash Collection', 'Cash Settlement'] } });

            const deliveredOrders = await Order.countDocuments({ deliveryBoy: rider._id, status: 'delivered' });
            const pendingCodOrders = await Order.countDocuments({
                deliveryBoy: rider._id,
                'payment.method': { $in: ['cash', 'cod'] },
                status: { $in: ['delivered', 'picked_up', 'out_for_delivery'] }
            });

            console.log(`Rider: ${rider.name} (${rider._id})`);
            console.log(` - Total Transactions: ${txnCount}`);
            console.log(` - Cash Transactions: ${cashTxns.length}`);
            console.log(` - Delivered Orders: ${deliveredOrders}`);
            console.log(` - Pending COD Orders: ${pendingCodOrders}`);

            if (cashTxns.length > 0) {
                console.log("   Details:");
                cashTxns.forEach(t => console.log(`    - ${t.type}: ₹${t.amount} (${t.reference})`));
            }
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

checkData();
