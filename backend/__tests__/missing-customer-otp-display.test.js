/**
 * Bug Condition Exploration Test: Missing Customer OTP Display
 * 
 * **Validates: Requirements 2.1, 2.2**
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **NOTE**: This test encodes the expected behavior - it will validate the fix when it passes after implementation
 * 
 * **GOAL**: Surface counterexamples that demonstrate the bug exists
 * 
 * Bug Condition: Customer viewing OUT_FOR_DELIVERY order with valid OTP in database but null handoffOtp state
 * Expected Behavior: Customer should see the 4-digit delivery OTP displayed prominently with clear instructions
 */

import fc from "fast-check";
import mongoose from "mongoose";
import request from "supertest";
import express from "express";
import Order from "../app/models/order.js";
import OrderOtp from "../app/models/orderOtp.js";
import User from "../app/models/customer.js";
import jwt from "jsonwebtoken";
import { WORKFLOW_STATUS } from "../app/constants/orderWorkflow.js";
import setupRoutes from "../app/routes/index.js";
import dotenv from "dotenv";

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || "test-secret-key";
const RUN_DB_TESTS = process.env.RUN_DB_TESTS === "true";
const describeDb = RUN_DB_TESTS ? describe : describe.skip;

// Create test app instance
let app;

/**
 * Helper: Create a test customer and return auth token
 */
async function createTestCustomer(customerId = null) {
  const customer = await User.create({
    _id: customerId || new mongoose.Types.ObjectId(),
    name: "Test Customer",
    email: `test.customer.${Date.now()}@test.com`,
    phone: "1234567890",
    password: "hashedpassword",
    role: "customer",
    walletBalance: 0,
  });

  const token = jwt.sign(
    { id: customer._id.toString(), role: "customer" },
    JWT_SECRET,
    { expiresIn: "1h" }
  );

  return { customer, token };
}

/**
 * Helper: Create a test order in OUT_FOR_DELIVERY state
 */
async function createOutForDeliveryOrder(customerId, orderId) {
  const order = await Order.create({
    orderId,
    customer: customerId,
    seller: new mongoose.Types.ObjectId(),
    deliveryBoy: new mongoose.Types.ObjectId(),
    items: [
      {
        product: new mongoose.Types.ObjectId(),
        name: "Test Product",
        quantity: 1,
        price: 100,
        image: "test.jpg",
      },
    ],
    address: {
      type: "Home",
      name: "Test Address",
      address: "123 Test St",
      city: "Test City",
      phone: "1234567890",
      location: { lat: 12.9716, lng: 77.5946 },
    },
    payment: {
      method: "cash",
      status: "pending",
    },
    pricing: {
      subtotal: 100,
      deliveryFee: 20,
      gst: 10,
      tip: 0,
      total: 130,
    },
    status: "out_for_delivery",
    workflowStatus: WORKFLOW_STATUS.OUT_FOR_DELIVERY,
    workflowVersion: 2,
    outForDeliveryAt: new Date(),
  });

  return order;
}

/**
 * Helper: Create a valid unexpired OTP in the database
 */
async function createValidOtp(orderId, orderMongoId, code = "1234") {
  const codeHash = OrderOtp.hashCode(code);
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

  const otp = await OrderOtp.create({
    orderId,
    orderMongoId,
    codeHash,
    expiresAt,
    lastGeneratedAt: new Date(),
    consumedAt: null,
    attempts: 0,
    maxAttempts: 3,
  });

  return { otp, code };
}

describeDb("Bug Condition Exploration: Customer Cannot See OTP After Page Refresh or Late View", () => {
  // Test database connection
  beforeAll(async () => {
    const mongoUri =
      process.env.MONGO_URI_TEST || "mongodb://localhost:27017/quick-commerce-test";
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(mongoUri);
    }

    // Setup test app
    app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    setupRoutes(app);
  }, 30000); // 30 second timeout for database connection

  afterAll(async () => {
    await mongoose.connection.close();
  }, 30000); // 30 second timeout

  // Clean up test data after each test
  afterEach(async () => {
    await Order.deleteMany({ orderId: /^TEST_/ });
    await OrderOtp.deleteMany({ orderId: /^TEST_/ });
    await User.deleteMany({ email: /^test.*@test\.com$/ });
  }, 10000); // 10 second timeout

  /**
   * Property 1: Fault Condition - Customer Cannot See OTP After Page Refresh or Late View
   * 
   * **Validates: Requirements 2.1, 2.2**
   * 
   * For any customer viewing their order detail page where:
   * - Order is OUT_FOR_DELIVERY
   * - Valid unexpired OTP exists in database
   * - Customer is viewing the page (simulating page refresh or late view)
   * 
   * The system SHALL display the 4-digit delivery OTP prominently with clear instructions.
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: This test WILL FAIL
   * - The API response will NOT include the deliveryOtp field
   * - This proves the bug exists: OTP is not fetched from database and returned to customer
   */
  test("Property: Customer viewing OUT_FOR_DELIVERY order with valid OTP in database should see OTP in API response", async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate random 4-digit OTP codes
        fc.integer({ min: 1000, max: 9999 }).map(String),
        async (otpCode) => {
          // Setup: Create customer, order, and OTP
          const { customer, token } = await createTestCustomer();
          const orderId = `TEST_ORD_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
          const order = await createOutForDeliveryOrder(customer._id, orderId);
          const { otp } = await createValidOtp(orderId, order._id, otpCode);

          // Act: Customer fetches order details (simulating page refresh or late view)
          const response = await request(app)
            .get(`/api/orders/details/${orderId}`)
            .set("Authorization", `Bearer ${token}`);

          // Assert: Response should be successful
          expect(response.status).toBe(200);
          expect(response.body.success).toBe(true);
          expect(response.body.result).toBeDefined();

          const orderData = response.body.result;

          // **CRITICAL ASSERTION**: OTP should be included in the response
          // This will FAIL on unfixed code because getOrderDetails doesn't fetch/return OTP
          expect(orderData.deliveryOtp).toBeDefined();
          expect(orderData.deliveryOtp).toBe(otpCode);

          // Additional assertions: Verify order is in correct state
          expect(orderData.orderId).toBe(orderId);
          expect(orderData.workflowStatus).toBe(WORKFLOW_STATUS.OUT_FOR_DELIVERY);

          // Cleanup
          await Order.deleteOne({ _id: order._id });
          await OrderOtp.deleteOne({ _id: otp._id });
          await User.deleteOne({ _id: customer._id });
        }
      ),
      {
        numRuns: 3, // Run 3 test cases with different OTP codes
        verbose: true,
      }
    );
  });

  /**
   * Scenario 1: Page Refresh After Receiving OTP
   * 
   * Customer receives OTP via socket, then refreshes page.
   * Expected: OTP should still be visible (fetched from database via REST API)
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: FAILS - OTP disappears after refresh
   */
  test("Scenario: Customer refreshes page after OTP was sent - OTP should still be visible", async () => {
    // Setup
    const { customer, token } = await createTestCustomer();
    const orderId = `TEST_ORD_REFRESH_${Date.now()}`;
    const order = await createOutForDeliveryOrder(customer._id, orderId);
    const otpCode = "5678";
    const { otp } = await createValidOtp(orderId, order._id, otpCode);

    // Act: Simulate page refresh by fetching order details
    const response = await request(app)
      .get(`/api/orders/details/${orderId}`)
      .set("Authorization", `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    const orderData = response.body.result;

    // **CRITICAL**: OTP should be present in response (will FAIL on unfixed code)
    expect(orderData.deliveryOtp).toBe(otpCode);

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    await OrderOtp.deleteOne({ _id: otp._id });
    await User.deleteOne({ _id: customer._id });
  });

  /**
   * Scenario 2: Late Page View After OTP Was Requested
   * 
   * Delivery agent requests OTP, then customer views page 2 minutes later.
   * Expected: OTP should be visible (fetched from database)
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: FAILS - No OTP shown
   */
  test("Scenario: Customer views page after OTP was requested but socket event was missed", async () => {
    // Setup
    const { customer, token } = await createTestCustomer();
    const orderId = `TEST_ORD_LATE_${Date.now()}`;
    const order = await createOutForDeliveryOrder(customer._id, orderId);
    const otpCode = "9012";
    
    // Simulate OTP was requested 2 minutes ago
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
    const { otp } = await createValidOtp(orderId, order._id, otpCode);
    await OrderOtp.updateOne(
      { _id: otp._id },
      { lastGeneratedAt: twoMinutesAgo }
    );

    // Act: Customer views page (missed the socket event)
    const response = await request(app)
      .get(`/api/orders/details/${orderId}`)
      .set("Authorization", `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    const orderData = response.body.result;

    // **CRITICAL**: OTP should be present even though socket event was missed (will FAIL on unfixed code)
    expect(orderData.deliveryOtp).toBe(otpCode);

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    await OrderOtp.deleteOne({ _id: otp._id });
    await User.deleteOne({ _id: customer._id });
  });

  /**
   * Scenario 3: Socket Disconnection
   * 
   * Customer views page while socket is disconnected, OTP exists in database.
   * Expected: OTP should be visible (fetched via REST API)
   * 
   * **EXPECTED OUTCOME ON UNFIXED CODE**: FAILS - No OTP shown
   */
  test("Scenario: Customer views page with socket disconnected but valid OTP in database", async () => {
    // Setup
    const { customer, token } = await createTestCustomer();
    const orderId = `TEST_ORD_SOCKET_${Date.now()}`;
    const order = await createOutForDeliveryOrder(customer._id, orderId);
    const otpCode = "3456";
    const { otp } = await createValidOtp(orderId, order._id, otpCode);

    // Act: Customer fetches order details (socket is disconnected, so no real-time update)
    const response = await request(app)
      .get(`/api/orders/details/${orderId}`)
      .set("Authorization", `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    const orderData = response.body.result;

    // **CRITICAL**: OTP should be fetched from database via REST API (will FAIL on unfixed code)
    expect(orderData.deliveryOtp).toBe(otpCode);

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    await OrderOtp.deleteOne({ _id: otp._id });
    await User.deleteOne({ _id: customer._id });
  });

  /**
   * Edge Case: Expired OTP Should Not Be Displayed
   * 
   * Customer views page with expired OTP in database.
   * Expected: No OTP should be displayed
   * 
   * **EXPECTED OUTCOME**: This test should PASS even on unfixed code (no OTP expected)
   */
  test("Edge Case: Expired OTP should not be displayed", async () => {
    // Setup
    const { customer, token } = await createTestCustomer();
    const orderId = `TEST_ORD_EXPIRED_${Date.now()}`;
    const order = await createOutForDeliveryOrder(customer._id, orderId);
    const otpCode = "7890";
    
    // Create expired OTP
    const codeHash = OrderOtp.hashCode(otpCode);
    const expiredAt = new Date(Date.now() - 5 * 60 * 1000); // 5 minutes ago
    const otp = await OrderOtp.create({
      orderId,
      orderMongoId: order._id,
      codeHash,
      expiresAt: expiredAt,
      lastGeneratedAt: new Date(Date.now() - 10 * 60 * 1000),
      consumedAt: null,
    });

    // Act
    const response = await request(app)
      .get(`/api/orders/details/${orderId}`)
      .set("Authorization", `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    const orderData = response.body.result;

    // Expired OTP should NOT be displayed
    expect(orderData.deliveryOtp).toBeUndefined();

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    await OrderOtp.deleteOne({ _id: otp._id });
    await User.deleteOne({ _id: customer._id });
  });

  /**
   * Edge Case: Consumed OTP Should Not Be Displayed
   * 
   * Customer views page with consumed OTP in database.
   * Expected: No OTP should be displayed
   * 
   * **EXPECTED OUTCOME**: This test should PASS even on unfixed code (no OTP expected)
   */
  test("Edge Case: Consumed OTP should not be displayed", async () => {
    // Setup
    const { customer, token } = await createTestCustomer();
    const orderId = `TEST_ORD_CONSUMED_${Date.now()}`;
    const order = await createOutForDeliveryOrder(customer._id, orderId);
    const otpCode = "2468";
    
    // Create consumed OTP
    const codeHash = OrderOtp.hashCode(otpCode);
    const otp = await OrderOtp.create({
      orderId,
      orderMongoId: order._id,
      codeHash,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000),
      lastGeneratedAt: new Date(),
      consumedAt: new Date(), // Already consumed
    });

    // Act
    const response = await request(app)
      .get(`/api/orders/details/${orderId}`)
      .set("Authorization", `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    const orderData = response.body.result;

    // Consumed OTP should NOT be displayed
    expect(orderData.deliveryOtp).toBeUndefined();

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    await OrderOtp.deleteOne({ _id: otp._id });
    await User.deleteOne({ _id: customer._id });
  });

  /**
   * Edge Case: Non-OUT_FOR_DELIVERY Order Should Not Display OTP
   * 
   * Customer views order in DELIVERY_ASSIGNED state.
   * Expected: No OTP should be displayed (not ready yet)
   * 
   * **EXPECTED OUTCOME**: This test should PASS even on unfixed code (no OTP expected)
   */
  test("Edge Case: Order not in OUT_FOR_DELIVERY state should not display OTP", async () => {
    // Setup
    const { customer, token } = await createTestCustomer();
    const orderId = `TEST_ORD_NOT_READY_${Date.now()}`;
    
    // Create order in DELIVERY_ASSIGNED state (not OUT_FOR_DELIVERY)
    const order = await Order.create({
      orderId,
      customer: customer._id,
      seller: new mongoose.Types.ObjectId(),
      deliveryBoy: new mongoose.Types.ObjectId(),
      items: [
        {
          product: new mongoose.Types.ObjectId(),
          name: "Test Product",
          quantity: 1,
          price: 100,
          image: "test.jpg",
        },
      ],
      address: {
        type: "Home",
        name: "Test Address",
        address: "123 Test St",
        city: "Test City",
        phone: "1234567890",
        location: { lat: 12.9716, lng: 77.5946 },
      },
      payment: { method: "cash", status: "pending" },
      pricing: { subtotal: 100, deliveryFee: 20, gst: 10, tip: 0, total: 130 },
      status: "confirmed",
      workflowStatus: WORKFLOW_STATUS.DELIVERY_ASSIGNED,
      workflowVersion: 2,
    });

    // Act
    const response = await request(app)
      .get(`/api/orders/details/${orderId}`)
      .set("Authorization", `Bearer ${token}`);

    // Assert
    expect(response.status).toBe(200);
    const orderData = response.body.result;

    // OTP should NOT be displayed for non-OUT_FOR_DELIVERY orders
    expect(orderData.deliveryOtp).toBeUndefined();

    // Cleanup
    await Order.deleteOne({ _id: order._id });
    await User.deleteOne({ _id: customer._id });
  });
});
