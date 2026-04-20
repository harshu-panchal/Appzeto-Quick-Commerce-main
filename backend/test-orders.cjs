const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const Order = mongoose.model('Order', new mongoose.Schema({
        checkoutGroupId: String,
        orderId: String,
        createdAt: Date
    }));

    console.log('--- LOOKING BY Group ID ---');
    const targetGroupId = 'CHK-01KN1B8YG504KDMR6XH28E7GT7';
    const order = await Order.findOne({ checkoutGroupId: targetGroupId }).lean();
    console.log('Order by Group ID:', order);

    console.log('\n--- LAST 10 ORDERS ---');
    const lastOrders = await Order.find().sort({ createdAt: -1 }).limit(10).lean();
    lastOrders.forEach(o => {
        console.log(`ID: ${o.orderId}, Group: ${o.checkoutGroupId}, Created: ${o.createdAt}`);
    });

    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
