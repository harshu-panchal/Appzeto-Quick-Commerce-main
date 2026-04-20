const mongoose = require('mongoose');
const Order = require('./app/models/order.js').default;
const CheckoutGroup = require('./app/models/checkoutGroup.js').default;
const { updateCheckoutGroupPaymentStatus } = require('./app/services/paymentService.js');
require('dotenv').config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const testGroupId = 'CHK-TEST-' + Date.now();
    const orderId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();

    console.log('--- CREATING TEST DATA ---');
    const order = new Order({
        _id: orderId,
        orderId: 'ORD-TEST-' + Date.now(),
        customer: customerId,
        checkoutGroupId: testGroupId
    });
    await order.save();

    const group = new CheckoutGroup({
        checkoutGroupId: testGroupId,
        customer: customerId,
        orderIds: [orderId]
    });
    await group.save();

    console.log('Data saved. Verifying existence...');
    const foundOrderBefore = await db.collection('orders').findOne({ _id: orderId });
    console.log('Order exists before:', !!foundOrderBefore);

    console.log('--- CALLING updateCheckoutGroupPaymentStatus(FAILED) ---');
    // NOTE: This usually doesn't affect Order documents directly, 
    // it's updateCheckoutGroupPaymentStatus that updates the group.
    // BUT maybe I should call handleOrderSideEffectsFromPaymentStatus?
    const { handleOrderSideEffectsFromPaymentStatus } = require('./app/services/paymentService.js');
    
    // We need a dummy payment record
    const payment = {
        _id: new mongoose.Types.ObjectId(),
        orderIds: [orderId],
        checkoutGroupId: testGroupId,
        status: 'FAILED'
    };

    await handleOrderSideEffectsFromPaymentStatus(payment, 'FAILED', 'For Testing');

    console.log('Post-process verification...');
    const foundOrderAfter = await db.collection('orders').findOne({ _id: orderId });
    console.log('Order exists after:', !!foundOrderAfter);
    if (foundOrderAfter) {
        console.log('Order status:', foundOrderAfter.status);
    } else {
        console.log('ORDER DISAPPEARED!');
    }

    process.exit(0);
}

run().catch(e => {
    console.error(e);
    process.exit(1);
});
