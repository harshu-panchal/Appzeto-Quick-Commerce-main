const mongoose = require('mongoose');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const today = new Date();
    today.setHours(0,0,0,0);

    console.log('--- RECENT ORDERS FROM TODAY ---');
    const orderCount = await db.collection('orders').countDocuments({ createdAt: { $gte: today } });
    console.log('Today Orders Count:', orderCount);

    const groupCount = await db.collection('checkoutgroups').countDocuments({ createdAt: { $gte: today } });
    console.log('Today Group Count:', groupCount);

    const paymentCount = await db.collection('payments').countDocuments({ createdAt: { $gte: today } });
    console.log('Today Payment Count:', paymentCount);

    if (orderCount > 0) {
        const order = await db.collection('orders').findOne({ createdAt: { $gte: today } });
        console.log('One Today Order:', JSON.stringify(order, null, 2));
    }

    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
