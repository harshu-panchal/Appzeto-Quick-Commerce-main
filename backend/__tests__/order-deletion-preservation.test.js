import { jest } from '@jest/globals';
import mongoose from 'mongoose';

/**
 * Preservation Tests: Order Deletion on Refresh Bug
 * 
 * Property 2: Preservation - Non-Refresh Order Operations
 * 
 * These tests verify that all order operations that are NOT affected by the bug
 * continue to work correctly after the fix is applied. This includes:
 * - Orders at other workflow stages (SELLER_PENDING, DELIVERY_ASSIGNED, DELIVERED, etc.)
 * - Seller, delivery agent, and admin access to orders
 * - Order creation, status updates, and cancellation workflows
 * 
 * IMPORTANT: Follow observation-first methodology
 * - Run these tests on UNFIXED code first to observe baseline behavior
 * - Tests should PASS on unfixed code
 * - After fix, tests should still PASS (confirms no regressions)
 */

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === "true";
const describeDb = RUN_DB_TESTS ? describe : describe.skip;

describeDb('Property 2: Preservation - Non-Refresh Order Operations', () => {
  let Order, Customer, Seller, Delivery, getOrderDetails;
  let testCustomer, testSeller, testDeliveryBoy;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-order-preservation', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // Import models and functions
    Order = (await import('../app/models/order.js')).default;
    Customer = (await import('../app/models/customer.js')).default;
    Seller = (await import('../app/models/seller.js')).default;
    Delivery = (await import('../app/models/delivery.js')).default;
    
    const orderController = await import('../app/controller/orderController.js');
    getOrderDetails = orderController.getOrderDetails;
  });

  beforeEach(async () => {
    // Clean up test data
    await Order.deleteMany({});
    await Customer.deleteMany({});
    await Seller.deleteMany({});
    await Delivery.deleteMany({});

    // Create test users
    testCustomer = await Customer.create({
      name: 'Test Customer',
      email: 'customer-preserve@test.com',
      phone: '1111111111',
      role: 'user',
      password: 'hashedpassword',
    });

    testSeller = await Seller.create({
      name: 'Test Seller',
      email: 'seller-preserve@test.com',
      phone: '2222222222',
      password: 'hashedpassword',
      shopName: 'Test Shop',
    });

    testDeliveryBoy = await Delivery.create({
      name: 'Test Delivery',
      phone: '3333333333',
      vehicleType: 'bike',
    });
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Order.deleteMany({});
    await Customer.deleteMany({});
    await Seller.deleteMany({});
    await Delivery.deleteMany({});
    await mongoose.connection.close();
  });

  /**
   * Test Case 1: Orders at Other Workflow Stages
   * 
   * Verifies that orders at stages other than OUT_FOR_DELIVERY remain accessible
   * to customers without any issues.
   */
  describe('Orders at other workflow stages', () => {
    const workflowStages = [
      'SELLER_PENDING',
      'DELIVERY_ASSIGNED',
      'PICKUP_READY',
      'DELIVERED',
      'CANCELLED',
    ];

    workflowStages.forEach((stage) => {
      it(`should allow customer to access order at ${stage} stage`, async () => {
        // Create order at specific workflow stage
        const order = await Order.create({
          orderId: `ORD-PRESERVE-${stage}`,
          customer: testCustomer._id,
          seller: testSeller._id,
          deliveryBoy: stage !== 'SELLER_PENDING' ? testDeliveryBoy._id : undefined,
          items: [
            {
              product: new mongoose.Types.ObjectId(),
              name: 'Test Product',
              quantity: 1,
              price: 100,
            },
          ],
          address: {
            type: 'Home',
            name: 'Test Address',
            address: '123 Test St',
            city: 'Test City',
            phone: '1111111111',
            location: { lat: 12.9716, lng: 77.5946 },
          },
          payment: { method: 'cash', status: 'pending' },
          pricing: { subtotal: 100, deliveryFee: 20, platformFee: 10, gst: 10, total: 140 },
          status: stage === 'DELIVERED' ? 'delivered' : stage === 'CANCELLED' ? 'cancelled' : 'pending',
          workflowStatus: stage,
          workflowVersion: 2,
        });

        // Customer requests order details
        const req = {
          params: { orderId: order.orderId },
          user: { id: testCustomer._id.toString(), role: 'user' },
        };

        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
        };

        await getOrderDetails(req, res);

        // Verify order is accessible
        const statusCall = res.status.mock.calls[0];
        const jsonCall = res.json.mock.calls[0];

        expect(statusCall?.[0]).toBe(200);
        expect(jsonCall?.[0]).toHaveProperty('result');
        expect(jsonCall?.[0].result).toHaveProperty('customer');
        expect(jsonCall?.[0].result.customer).not.toBeNull();
      });
    });
  });

  /**
   * Test Case 2: Seller Access
   * 
   * Verifies that sellers can access their orders correctly.
   */
  it('should allow seller to access their orders', async () => {
    const order = await Order.create({
      orderId: 'ORD-SELLER-ACCESS',
      customer: testCustomer._id,
      seller: testSeller._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          quantity: 1,
          price: 100,
        },
      ],
      address: {
        type: 'Home',
        name: 'Test Address',
        address: '123 Test St',
        city: 'Test City',
        phone: '1111111111',
        location: { lat: 12.9716, lng: 77.5946 },
      },
      payment: { method: 'cash', status: 'pending' },
      pricing: { subtotal: 100, deliveryFee: 20, platformFee: 10, gst: 10, total: 140 },
      status: 'pending',
      workflowStatus: 'SELLER_PENDING',
      workflowVersion: 2,
    });

    // Seller requests order details
    const req = {
      params: { orderId: order.orderId },
      user: { id: testSeller._id.toString(), role: 'seller' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getOrderDetails(req, res);

    // Verify order is accessible
    const statusCall = res.status.mock.calls[0];
    const jsonCall = res.json.mock.calls[0];

    expect(statusCall?.[0]).toBe(200);
    expect(jsonCall?.[0]).toHaveProperty('result');
    expect(jsonCall?.[0].result.seller).toBeDefined();
  });

  /**
   * Test Case 3: Delivery Agent Access
   * 
   * Verifies that delivery agents can access assigned orders correctly.
   */
  it('should allow delivery agent to access assigned orders', async () => {
    const order = await Order.create({
      orderId: 'ORD-DELIVERY-ACCESS',
      customer: testCustomer._id,
      seller: testSeller._id,
      deliveryBoy: testDeliveryBoy._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          quantity: 1,
          price: 100,
        },
      ],
      address: {
        type: 'Home',
        name: 'Test Address',
        address: '123 Test St',
        city: 'Test City',
        phone: '1111111111',
        location: { lat: 12.9716, lng: 77.5946 },
      },
      payment: { method: 'cash', status: 'pending' },
      pricing: { subtotal: 100, deliveryFee: 20, platformFee: 10, gst: 10, total: 140 },
      status: 'out_for_delivery',
      workflowStatus: 'OUT_FOR_DELIVERY',
      workflowVersion: 2,
    });

    // Delivery agent requests order details
    const req = {
      params: { orderId: order.orderId },
      user: { id: testDeliveryBoy._id.toString(), role: 'delivery' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getOrderDetails(req, res);

    // Verify order is accessible
    const statusCall = res.status.mock.calls[0];
    const jsonCall = res.json.mock.calls[0];

    expect(statusCall?.[0]).toBe(200);
    expect(jsonCall?.[0]).toHaveProperty('result');
    expect(jsonCall?.[0].result.deliveryBoy).toBeDefined();
  });

  /**
   * Test Case 4: Order Creation
   * 
   * Verifies that newly created orders have valid customer references
   * and are immediately accessible.
   */
  it('should create orders with valid customer references', async () => {
    const order = await Order.create({
      orderId: 'ORD-CREATION-TEST',
      customer: testCustomer._id,
      seller: testSeller._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          quantity: 1,
          price: 100,
        },
      ],
      address: {
        type: 'Home',
        name: 'Test Address',
        address: '123 Test St',
        city: 'Test City',
        phone: '1111111111',
        location: { lat: 12.9716, lng: 77.5946 },
      },
      payment: { method: 'cash', status: 'pending' },
      pricing: { subtotal: 100, deliveryFee: 20, platformFee: 10, gst: 10, total: 140 },
      status: 'pending',
      workflowStatus: 'SELLER_PENDING',
      workflowVersion: 2,
    });

    // Verify customer field is valid
    expect(order.customer).not.toBeNull();
    expect(order.customer).not.toBeUndefined();
    expect(order.customer.toString()).toBe(testCustomer._id.toString());

    // Verify order is immediately accessible
    const req = {
      params: { orderId: order.orderId },
      user: { id: testCustomer._id.toString(), role: 'user' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getOrderDetails(req, res);

    const statusCall = res.status.mock.calls[0];
    expect(statusCall?.[0]).toBe(200);
  });

  /**
   * Test Case 5: Status Updates
   * 
   * Verifies that status updates preserve customer references.
   */
  it('should preserve customer reference during status updates', async () => {
    const order = await Order.create({
      orderId: 'ORD-STATUS-UPDATE',
      customer: testCustomer._id,
      seller: testSeller._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          quantity: 1,
          price: 100,
        },
      ],
      address: {
        type: 'Home',
        name: 'Test Address',
        address: '123 Test St',
        city: 'Test City',
        phone: '1111111111',
        location: { lat: 12.9716, lng: 77.5946 },
      },
      payment: { method: 'cash', status: 'pending' },
      pricing: { subtotal: 100, deliveryFee: 20, platformFee: 10, gst: 10, total: 140 },
      status: 'pending',
      workflowStatus: 'SELLER_PENDING',
      workflowVersion: 2,
    });

    // Update order status
    await Order.updateOne(
      { orderId: order.orderId },
      { $set: { workflowStatus: 'DELIVERY_ASSIGNED', deliveryBoy: testDeliveryBoy._id } }
    );

    // Verify customer reference is preserved
    const updatedOrder = await Order.findOne({ orderId: order.orderId });
    expect(updatedOrder.customer).not.toBeNull();
    expect(updatedOrder.customer).not.toBeUndefined();
    expect(updatedOrder.customer.toString()).toBe(testCustomer._id.toString());
  });

  /**
   * Test Case 6: Cancellation
   * 
   * Verifies that order cancellation workflows maintain customer references.
   */
  it('should maintain customer reference during cancellation', async () => {
    const order = await Order.create({
      orderId: 'ORD-CANCELLATION',
      customer: testCustomer._id,
      seller: testSeller._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          quantity: 1,
          price: 100,
        },
      ],
      address: {
        type: 'Home',
        name: 'Test Address',
        address: '123 Test St',
        city: 'Test City',
        phone: '1111111111',
        location: { lat: 12.9716, lng: 77.5946 },
      },
      payment: { method: 'cash', status: 'pending' },
      pricing: { subtotal: 100, deliveryFee: 20, platformFee: 10, gst: 10, total: 140 },
      status: 'pending',
      workflowStatus: 'SELLER_PENDING',
      workflowVersion: 2,
    });

    // Cancel order
    await Order.updateOne(
      { orderId: order.orderId },
      { $set: { workflowStatus: 'CANCELLED', cancelledBy: 'customer', cancelReason: 'Test cancellation' } }
    );

    // Verify customer reference is preserved
    const cancelledOrder = await Order.findOne({ orderId: order.orderId });
    expect(cancelledOrder.customer).not.toBeNull();
    expect(cancelledOrder.customer).not.toBeUndefined();
    expect(cancelledOrder.customer.toString()).toBe(testCustomer._id.toString());

    // Verify customer can still access cancelled order
    const req = {
      params: { orderId: order.orderId },
      user: { id: testCustomer._id.toString(), role: 'user' },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getOrderDetails(req, res);

    const statusCall = res.status.mock.calls[0];
    expect(statusCall?.[0]).toBe(200);
  });
});
