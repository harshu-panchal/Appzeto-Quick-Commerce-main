import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Order from './app/models/order.js';
import CheckoutGroup from './app/models/checkoutGroup.js';
import { handleOrderSideEffectsFromPaymentStatus } from './app/services/paymentService.js';

dotenv.config();

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const db = mongoose.connection.db;

    const testGroupId = 'CHK-TEST-' + Date.now();
    const orderId = new mongoose.Types.ObjectId();
    const customerId = new mongoose.Types.ObjectId();
    const sellerId = new mongoose.Types.ObjectId();

    console.log('--- CREATING TEST DATA ---');
    const order = new Order({
        _id: orderId,
        orderId: 'ORD-TEST-' + Date.now(),
        customer: customerId,
        seller: sellerId,
        checkoutGroupId: testGroupId,
        items: [{
            product: new mongoose.Types.ObjectId(),
            name: 'Test Project',
            quantity: 1,
            price: 100
        }]
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

    console.log('--- CALLING handleOrderSideEffectsFromPaymentStatus(FAILED) ---');
    
    // We need a mock payment object
    const payment = {
        _id: new mongoose.Types.ObjectId(),
        orderIds: [orderId],
        checkoutGroupId: testGroupId,
        status: 'FAILED',
        gatewayPaymentId: 'GAY-PAY-123'
    };

    await handleOrderSideEffectsFromPaymentStatus(payment, 'FAILED', 'For Testing Disappearance');

    console.log('Post-process verification...');
    const foundOrderAfter = await db.collection('orders').findOne({ _id: orderId });
    console.log('Order exists after:', !!foundOrderAfter);
    if (foundOrderAfter) {
        console.log('Order status:', foundOrderAfter.status);
        console.log('Order workflowStatus:', foundOrderAfter.workflowStatus);
    } else {
        console.log('!!! ORDER DISAPPEARED !!!');
    }

    process.exit(0);
}

run().catch(e => {
    console.error('ERROR:', e);
    process.exit(1);
});
