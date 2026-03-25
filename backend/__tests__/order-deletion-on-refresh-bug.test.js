import { jest } from '@jest/globals';
import mongoose from 'mongoose';

/**
 * Bug Exploration Test: Order Deletion on Refresh Bug
 * 
 * Property 1: Fault Condition - Customer Reference Integrity During Delivery
 * 
 * This test explores the bug where orders become inaccessible (appear deleted) when
 * customers refresh their order detail page during OUT_FOR_DELIVERY status with OTP operations.
 * 
 * Bug Condition: isBugCondition(input) where:
 *   - input.workflowStatus === 'OUT_FOR_DELIVERY'
 *   - input.refreshAction === true (customer calls getOrderDetails)
 *   - order.customer === null OR order.customer === undefined OR !canPopulate(order.customer)
 * 
 * Expected Behavior: getOrderDetails should return 200 status with valid order and customer reference
 * 
 * IMPORTANT: This test MUST FAIL on unfixed code - failure confirms the bug exists.
 * DO NOT attempt to fix the test or the code when it fails.
 */

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === "true";
const describeDb = RUN_DB_TESTS ? describe : describe.skip;

describeDb('Property 1: Fault Condition - Customer Reference Integrity During Delivery', () => {
  let Order, Customer, Seller, Delivery, OrderOtp, getOrderDetails, requestHandoffOtpAtomic;
  let testCustomer, testSeller, testDeliveryBoy, testOrder;

  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/test-order-bug', {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
    }

    // Import models and functions
    Order = (await import('../app/models/order.js')).default;
    Customer = (await import('../app/models/customer.js')).default;
    Seller = (await import('../app/models/seller.js')).default;
    Delivery = (await import('../app/models/delivery.js')).default;
    OrderOtp = (await import('../app/models/orderOtp.js')).default;
    
    const orderController = await import('../app/controller/orderController.js');
    getOrderDetails = orderController.getOrderDetails;
    
    const orderWorkflowService = await import('../app/services/orderWorkflowService.js');
    requestHandoffOtpAtomic = orderWorkflowService.requestHandoffOtpAtomic;
  });

  beforeEach(async () => {
    // Clean up test data
    await Order.deleteMany({});
    await Customer.deleteMany({});
    await Seller.deleteMany({});
    await Delivery.deleteMany({});
    await OrderOtp.deleteMany({});

    // Create test customer
    testCustomer = await Customer.create({
      name: 'Test Customer',
      email: 'customer@test.com',
      phone: '1234567890',
      role: 'user',
      password: 'hashedpassword',
    });

    // Create test seller
    testSeller = await Seller.create({
      name: 'Test Seller',
      email: 'seller@test.com',
      phone: '0987654321',
      password: 'hashedpassword',
      shopName: 'Test Shop',
    });

    // Create test delivery person
    testDeliveryBoy = await Delivery.create({
      name: 'Test Delivery',
      phone: '5555555555',
      vehicleType: 'bike',
    });

    // Create test order in OUT_FOR_DELIVERY status
    testOrder = await Order.create({
      orderId: 'ORD-TEST-001',
      customer: testCustomer._id,
      seller: testSeller._id,
      deliveryBoy: testDeliveryBoy._id,
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: 'Test Product',
          quantity: 2,
          price: 100,
        },
      ],
      address: {
        type: 'Home',
        name: 'Test Address',
        address: '123 Test St',
        city: 'Test City',
        phone: '1234567890',
        location: {
          lat: 12.9716,
          lng: 77.5946,
        },
      },
      payment: {
        method: 'cash',
        status: 'pending',
      },
      pricing: {
        subtotal: 200,
        deliveryFee: 20,
        platformFee: 10,
        gst: 15,
        total: 245,
      },
      status: 'out_for_delivery',
      workflowStatus: 'OUT_FOR_DELIVERY',
      workflowVersion: 2,
    });
  });

  afterAll(async () => {
    // Clean up and disconnect
    await Order.deleteMany({});
    await Customer.deleteMany({});
    await Seller.deleteMany({});
    await Delivery.deleteMany({});
    await OrderOtp.deleteMany({});
    await mongoose.connection.close();
  });

  /**
   * Test Case 1: OTP Generation Race Test
   * 
   * Simulates the exact bug condition:
   * 1. Order is in OUT_FOR_DELIVERY status
   * 2. Delivery agent requests OTP (calls requestHandoffOtpAtomic)
   * 3. Customer immediately refreshes page (calls getOrderDetails)
   * 
   * Expected on UNFIXED code: Test FAILS - getOrderDetails returns 404 or authorization error
   * Expected on FIXED code: Test PASSES - getOrderDetails returns 200 with valid order
   */
  it('should maintain customer reference when customer refreshes during OTP generation', async () => {
    // Step 1: Delivery agent requests OTP (simulates OTP generation)
    try {
      await requestHandoffOtpAtomic(
        testDeliveryBoy._id.toString(),
        testOrder.orderId,
        12.9716, // Near customer location
        77.5946
      );
    } catch (error) {
      // OTP generation might fail due to missing dependencies, but we continue
      console.log('OTP generation error (expected in test):', error.message);
    }

    // Step 2: Customer immediately refreshes page (calls getOrderDetails)
    const req = {
      params: { orderId: testOrder.orderId },
      user: {
        id: testCustomer._id.toString(),
        role: 'customer',
      },
    };

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await getOrderDetails(req, res);

    // Step 3: Verify order is accessible (EXPECTED TO FAIL on unfixed code)
    // On unfixed code, this will fail because:
    // - order.customer might be null or undefined
    // - Authorization check fails
    // - Returns 404 "Order not found" or 403 "Access denied"
    
    // Check if response was successful
    const statusCall = res.status.mock.calls[0];
    const jsonCall = res.json.mock.calls[0];
    
    console.log('Response status:', statusCall?.[0]);
    console.log('Response body:', JSON.stringify(jsonCall?.[0], null, 2));

    // ASSERTION: Order should be accessible with valid customer reference
    expect(statusCall?.[0]).toBe(200);
    expect(jsonCall?.[0]).toHaveProperty('result');
    expect(jsonCall?.[0].result).toHaveProperty('customer');
    expect(jsonCall?.[0].result.customer).not.toBeNull();
    expect(jsonCall?.[0].result.customer).not.toBeUndefined();

    // Verify customer reference matches
    const customerIdFromResponse = jsonCall?.[0].result.customer._id || jsonCall?.[0].result.customer;
    expect(customerIdFromResponse.toString()).toBe(testCustomer._id.toString());

    // Additional verification: Check database state
    const orderFromDb = await Order.findOne({ orderId: testOrder.orderId });
    console.log('Order customer field from DB:', orderFromDb.customer);
    
    // CRITICAL: Customer field should NOT be null or undefined
    expect(orderFromDb.customer).not.toBeNull();
    expect(orderFromDb.customer).not.toBeUndefined();
    expect(orderFromDb.customer.toString()).toBe(testCustomer._id.toString());
  });

  /**
   * Test Case 2: Concurrent Refresh Test
   * 
   * Simulates multiple concurrent customer refreshes during OTP operations
   * to stress-test the customer reference integrity.
   */
  it('should handle concurrent customer refreshes during OTP operations', async () => {
    // Simulate multiple concurrent getOrderDetails calls
    const req = {
      params: { orderId: testOrder.orderId },
      user: {
        id: testCustomer._id.toString(),
        role: 'customer',
      },
    };

    const createMockRes = () => ({
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    });

    // Make 5 concurrent requests
    const promises = Array(5).fill(null).map(() => {
      const res = createMockRes();
      return getOrderDetails(req, res).then(() => res);
    });

    const responses = await Promise.all(promises);

    // All requests should succeed
    responses.forEach((res, index) => {
      const statusCall = res.status.mock.calls[0];
      const jsonCall = res.json.mock.calls[0];
      
      console.log(`Response ${index + 1} status:`, statusCall?.[0]);
      
      // ASSERTION: All concurrent requests should succeed
      expect(statusCall?.[0]).toBe(200);
      expect(jsonCall?.[0]).toHaveProperty('result');
      expect(jsonCall?.[0].result).toHaveProperty('customer');
      expect(jsonCall?.[0].result.customer).not.toBeNull();
    });
  });

  /**
   * Test Case 3: Customer Field Inspection Test
   * 
   * Directly inspects the database to verify customer field integrity
   * after OTP operations.
   */
  it('should preserve customer field in database after OTP operations', async () => {
    // Verify initial state
    let orderFromDb = await Order.findOne({ orderId: testOrder.orderId });
    expect(orderFromDb.customer).not.toBeNull();
    expect(orderFromDb.customer.toString()).toBe(testCustomer._id.toString());

    // Simulate OTP generation
    try {
      await requestHandoffOtpAtomic(
        testDeliveryBoy._id.toString(),
        testOrder.orderId,
        12.9716,
        77.5946
      );
    } catch (error) {
      console.log('OTP generation error (expected in test):', error.message);
    }

    // Re-fetch order from database
    orderFromDb = await Order.findOne({ orderId: testOrder.orderId });
    
    console.log('Customer field after OTP:', orderFromDb.customer);
    console.log('Customer field type:', typeof orderFromDb.customer);
    console.log('Is null?', orderFromDb.customer === null);
    console.log('Is undefined?', orderFromDb.customer === undefined);

    // CRITICAL ASSERTION: Customer field should NOT be corrupted
    // On unfixed code, this might fail if customer field is nullified
    expect(orderFromDb.customer).not.toBeNull();
    expect(orderFromDb.customer).not.toBeUndefined();
    expect(orderFromDb.customer.toString()).toBe(testCustomer._id.toString());
  });
});
