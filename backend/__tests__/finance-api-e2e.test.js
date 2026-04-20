import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import request from "supertest";
import { jest } from "@jest/globals";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

import User from "../app/models/customer.js";
import Seller from "../app/models/seller.js";
import Delivery from "../app/models/delivery.js";
import Category from "../app/models/category.js";
import Product from "../app/models/product.js";
import Setting from "../app/models/setting.js";
import Order from "../app/models/order.js";
import Wallet from "../app/models/wallet.js";
import Payout from "../app/models/payout.js";
import LedgerEntry from "../app/models/ledgerEntry.js";
import FinanceAuditLog from "../app/models/financeAuditLog.js";
import StockHistory from "../app/models/stockHistory.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../.env") });

process.env.REDIS_DISABLED = process.env.REDIS_DISABLED || "true";

const { verifyToken, allowRoles } = await import("../app/middleware/authMiddleware.js");
const {
  createOrderWithFinancialSnapshot,
  markCodCollectedAfterDelivery,
  markOrderDeliveredAndSettle,
  previewCheckoutFinance,
  reconcileCodCashSubmission,
  verifyOnlineOrderPayment,
} = await import("../app/controller/orderFinanceController.js");
const {
  getAdminFinanceSummaryController,
  processAdminFinancePayoutsController,
} = await import("../app/controller/adminFinanceController.js");

jest.setTimeout(120000);
const RUN_E2E = process.env.RUN_E2E_TESTS === "true";

function randomSuffix() {
  return `${Date.now()}${Math.floor(Math.random() * 10000)}`;
}

function createToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "2h" });
}

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "5mb" }));
  app.use(express.urlencoded({ extended: true }));

  app.post(
    "/api/orders/checkout/preview",
    verifyToken,
    allowRoles("customer", "user", "admin"),
    previewCheckoutFinance,
  );
  app.post(
    "/api/orders",
    verifyToken,
    allowRoles("customer", "user", "admin"),
    createOrderWithFinancialSnapshot,
  );
  app.post(
    "/api/orders/:id/payment/verify-online",
    verifyToken,
    allowRoles("customer", "user", "admin"),
    verifyOnlineOrderPayment,
  );
  app.post(
    "/api/orders/:id/cod/mark-collected",
    verifyToken,
    allowRoles("delivery", "admin"),
    markCodCollectedAfterDelivery,
  );
  app.post(
    "/api/orders/:id/delivered",
    verifyToken,
    allowRoles("delivery", "admin", "seller"),
    markOrderDeliveredAndSettle,
  );
  app.post(
    "/api/orders/:id/cod/reconcile",
    verifyToken,
    allowRoles("delivery", "admin"),
    reconcileCodCashSubmission,
  );

  app.get(
    "/api/admin/finance/summary",
    verifyToken,
    allowRoles("admin"),
    getAdminFinanceSummaryController,
  );
  app.post(
    "/api/admin/finance/payouts/process",
    verifyToken,
    allowRoles("admin"),
    processAdminFinancePayoutsController,
  );

  return app;
}

async function resetCollections() {
  await Promise.all([
    User.deleteMany({}),
    Seller.deleteMany({}),
    Delivery.deleteMany({}),
    Category.deleteMany({}),
    Product.deleteMany({}),
    Setting.deleteMany({}),
    Order.deleteMany({}),
    Wallet.deleteMany({}),
    Payout.deleteMany({}),
    LedgerEntry.deleteMany({}),
    FinanceAuditLog.deleteMany({}),
    StockHistory.deleteMany({}),
  ]);
}

async function seedCoreData() {
  const suffix = randomSuffix();

  const customer = await User.create({
    name: "E2E Customer",
    phone: `90000${suffix.slice(-5)}`,
    role: "user",
    isVerified: true,
  });

  const seller = await Seller.create({
    name: "E2E Seller",
    email: `seller_${suffix}@example.com`,
    phone: `91000${suffix.slice(-5)}`,
    password: "Password@123",
    shopName: "E2E Fresh Mart",
    isVerified: true,
    location: {
      type: "Point",
      coordinates: [77.5946, 12.9716],
    },
  });

  const rider = await Delivery.create({
    name: "E2E Rider",
    phone: `92000${suffix.slice(-5)}`,
    role: "delivery",
    isVerified: true,
    isOnline: true,
    location: {
      type: "Point",
      coordinates: [77.6000, 12.9750],
    },
  });

  const header = await Category.create({
    name: `Header ${suffix}`,
    slug: `header-${suffix}`,
    type: "header",
    adminCommissionType: "percentage",
    adminCommissionValue: 10,
    handlingFeeType: "fixed",
    handlingFeeValue: 20,
    status: "active",
  });

  const category = await Category.create({
    name: `Category ${suffix}`,
    slug: `category-${suffix}`,
    type: "category",
    parentId: header._id,
    status: "active",
  });

  const subcategory = await Category.create({
    name: `Subcategory ${suffix}`,
    slug: `subcategory-${suffix}`,
    type: "subcategory",
    parentId: category._id,
    status: "active",
  });

  const product = await Product.create({
    name: "E2E Apple Box",
    slug: `e2e-apple-${suffix}`,
    sku: `SKU-${suffix}`,
    description: "E2E pricing product",
    price: 100,
    salePrice: 100,
    stock: 50,
    headerId: header._id,
    categoryId: category._id,
    subcategoryId: subcategory._id,
    sellerId: seller._id,
    status: "active",
  });

  await Setting.create({
    deliveryPricingMode: "distance_based",
    pricingMode: "distance_based",
    customerBaseDeliveryFee: 30,
    riderBasePayout: 30,
    baseDeliveryCharge: 30,
    baseDistanceCapacityKm: 0.5,
    incrementalKmSurcharge: 10,
    deliveryPartnerRatePerKm: 5,
    fleetCommissionRatePerKm: 5,
    fixedDeliveryFee: 30,
    handlingFeeStrategy: "highest_category_fee",
    codEnabled: true,
    onlineEnabled: true,
  });

  return { customer, seller, rider, product };
}

(RUN_E2E ? describe : describe.skip)("Finance API E2E (Express + Mongo + Auth)", () => {
  let app;
  let mongoUri;
  let dbName;

  beforeAll(async () => {
    process.env.JWT_SECRET = process.env.JWT_SECRET || "e2e-test-secret";
    mongoUri = process.env.MONGO_URI_E2E || process.env.MONGO_URI;
    if (!mongoUri) {
      throw new Error("Set MONGO_URI_E2E (or MONGO_URI) to run API E2E tests");
    }

    dbName = `quick_commerce_finance_e2e_${Date.now()}`;
    await mongoose.connect(mongoUri, {
      dbName,
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
    });
    app = buildApp();
  });

  beforeEach(async () => {
    await resetCollections();
  });

  afterAll(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.connection.close();
    }
  });

  it("ONLINE flow: preview -> create -> payment capture -> delivered -> payout process", async () => {
    const { customer, rider, product } = await seedCoreData();

    const customerToken = createToken({
      id: String(customer._id),
      role: "user",
    });
    const riderToken = createToken({
      id: String(rider._id),
      role: "delivery",
    });
    const adminToken = createToken({
      id: new mongoose.Types.ObjectId().toString(),
      role: "admin",
    });

    const orderPayload = {
      items: [
        {
          product: String(product._id),
          quantity: 2,
          price: 100,
        },
      ],
      address: {
        type: "Home",
        name: "E2E Customer",
        address: "Indore Test Road",
        city: "Indore",
        phone: "9999999999",
        location: { lat: 12.9800, lng: 77.6100 },
      },
      paymentMode: "ONLINE",
      distanceKm: 2.2,
      discountTotal: 0,
      taxTotal: 0,
      timeSlot: "now",
    };

    const previewRes = await request(app)
      .post("/api/orders/checkout/preview")
      .set("Authorization", `Bearer ${customerToken}`)
      .send(orderPayload);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.success).toBe(true);
    expect(previewRes.body.result.breakdown.grandTotal).toBe(270);
    expect(previewRes.body.result.breakdown.platformTotalEarning).toBe(50);

    const createRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send(orderPayload);

    expect(createRes.status).toBe(201);
    const created = createRes.body.result;
    expect(created.paymentMode).toBe("ONLINE");
    expect(created.paymentBreakdown.grandTotal).toBe(270);
    expect(created.paymentBreakdown.sellerPayoutTotal).toBe(180);
    expect(created.paymentBreakdown.riderPayoutTotal).toBe(40);

    const orderId = created.orderId;
    const storedOrder = await Order.findOne({ orderId });
    storedOrder.deliveryBoy = rider._id;
    storedOrder.deliveryPartner = rider._id;
    await storedOrder.save();

    const prematureDelivered = await request(app)
      .post(`/api/orders/${orderId}/delivered`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});
    expect(prematureDelivered.status).toBe(500);
    expect(prematureDelivered.body.message).toContain(
      "Cannot settle delivered online order before payment capture",
    );

    const verifyOnlineRes = await request(app)
      .post(`/api/orders/${orderId}/payment/verify-online`)
      .set("Authorization", `Bearer ${customerToken}`)
      .send({ transactionId: `txn_${randomSuffix()}` });
    expect(verifyOnlineRes.status).toBe(200);
    expect(verifyOnlineRes.body.result.paymentStatus).toBe("PAID");

    const deliveredRes = await request(app)
      .post(`/api/orders/${orderId}/delivered`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});
    expect(deliveredRes.status).toBe(200);
    expect(deliveredRes.body.result.settlementStatus.sellerPayout).toBe("PENDING");
    expect(deliveredRes.body.result.settlementStatus.riderPayout).toBe("PENDING");
    expect(deliveredRes.body.result.settlementStatus.adminEarningCredited).toBe(true);

    const adminSummaryBeforePayout = await request(app)
      .get("/api/admin/finance/summary")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(adminSummaryBeforePayout.status).toBe(200);
    expect(adminSummaryBeforePayout.body.result.totalPlatformEarning).toBe(270);
    expect(adminSummaryBeforePayout.body.result.totalAdminEarning).toBe(50);
    expect(adminSummaryBeforePayout.body.result.sellerPendingPayouts).toBe(180);
    expect(adminSummaryBeforePayout.body.result.deliveryPendingPayouts).toBe(40);

    const pendingPayouts = await Payout.find({ status: "PENDING" }).sort({ createdAt: 1 });
    expect(pendingPayouts).toHaveLength(2);

    const processRes = await request(app)
      .post("/api/admin/finance/payouts/process")
      .set("Authorization", `Bearer ${adminToken}`)
      .send({
        payoutIds: pendingPayouts.map((p) => String(p._id)),
        remarks: "E2E payout processing",
      });
    expect(processRes.status).toBe(200);
    expect(processRes.body.result.completed).toBe(2);

    const sellerWallet = await Wallet.findOne({
      ownerType: "SELLER",
      ownerId: storedOrder.seller,
    }).lean();
    const riderWallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: rider._id,
    }).lean();
    const adminWallet = await Wallet.findOne({
      ownerType: "ADMIN",
      ownerId: null,
    }).lean();
    const completedOrder = await Order.findOne({ orderId }).lean();

    expect(sellerWallet.availableBalance).toBe(180);
    expect(sellerWallet.pendingBalance).toBe(0);
    expect(riderWallet.availableBalance).toBe(40);
    expect(riderWallet.pendingBalance).toBe(0);
    expect(adminWallet.availableBalance).toBe(50); // 270 capture - 220 payouts
    expect(completedOrder.settlementStatus.overall).toBe("COMPLETED");
    expect(completedOrder.settlementStatus.sellerPayout).toBe("COMPLETED");
    expect(completedOrder.settlementStatus.riderPayout).toBe("COMPLETED");

    const ledgerTypes = await LedgerEntry.distinct("type", { orderId: storedOrder._id });
    expect(ledgerTypes).toEqual(
      expect.arrayContaining([
        "ORDER_ONLINE_PAYMENT_CAPTURED",
        "SELLER_PAYOUT_PENDING",
        "RIDER_PAYOUT_PENDING",
        "ADMIN_EARNING_CREDITED",
        "SELLER_PAYOUT_PROCESSED",
        "RIDER_PAYOUT_PROCESSED",
      ]),
    );
  });

  it("COD flow with edge cases: pre-delivery block, idempotent collect, partial/full reconcile", async () => {
    const { customer, rider, product } = await seedCoreData();

    const customerToken = createToken({
      id: String(customer._id),
      role: "user",
    });
    const riderToken = createToken({
      id: String(rider._id),
      role: "delivery",
    });
    const adminToken = createToken({
      id: new mongoose.Types.ObjectId().toString(),
      role: "admin",
    });

    const createRes = await request(app)
      .post("/api/orders")
      .set("Authorization", `Bearer ${customerToken}`)
      .send({
        items: [{ product: String(product._id), quantity: 1, price: 100 }],
        address: {
          type: "Home",
          name: "E2E Customer",
          address: "Bhopal Test Road",
          city: "Bhopal",
          phone: "9999999999",
          location: { lat: 12.9800, lng: 77.6100 },
        },
        paymentMode: "COD",
        distanceKm: 1.1,
        discountTotal: 0,
        taxTotal: 0,
      });

    expect(createRes.status).toBe(201);
    const orderId = createRes.body.result.orderId;
    const orderDoc = await Order.findOne({ orderId });
    orderDoc.deliveryBoy = rider._id;
    orderDoc.deliveryPartner = rider._id;
    await orderDoc.save();

    const preDeliveryCollect = await request(app)
      .post(`/api/orders/${orderId}/cod/mark-collected`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});
    expect(preDeliveryCollect.status).toBe(400);
    expect(preDeliveryCollect.body.message).toContain("only after delivery");

    const deliveredRes = await request(app)
      .post(`/api/orders/${orderId}/delivered`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});
    expect(deliveredRes.status).toBe(200);
    expect(deliveredRes.body.result.paymentMode).toBe("COD");
    expect(deliveredRes.body.result.paymentStatus).toBe("CASH_COLLECTED");
    // Net of rider commission (grandTotal 160 - riderPayoutTotal 35)
    expect(deliveredRes.body.result.paymentBreakdown.codCollectedAmount).toBe(125);
    expect(deliveredRes.body.result.paymentBreakdown.codPendingAmount).toBe(125);

    const collectRes = await request(app)
      .post(`/api/orders/${orderId}/cod/mark-collected`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});
    expect(collectRes.status).toBe(200);
    expect(collectRes.body.message).toContain("already marked");
    expect(collectRes.body.result.paymentStatus).toBe("CASH_COLLECTED");
    expect(collectRes.body.result.paymentBreakdown.codPendingAmount).toBe(125);

    const collectAgainRes = await request(app)
      .post(`/api/orders/${orderId}/cod/mark-collected`)
      .set("Authorization", `Bearer ${riderToken}`)
      .send({});
    expect(collectAgainRes.status).toBe(200);
    expect(collectAgainRes.body.message).toContain("already marked");

    const overReconcile = await request(app)
      .post(`/api/orders/${orderId}/cod/reconcile`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: 200, deliveryPartnerId: String(rider._id) });
    expect(overReconcile.status).toBe(500);
    expect(overReconcile.body.message).toContain("exceeds COD pending amount");

    const reconcilePartial = await request(app)
      .post(`/api/orders/${orderId}/cod/reconcile`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: 60, deliveryPartnerId: String(rider._id) });
    expect(reconcilePartial.status).toBe(200);
    expect(reconcilePartial.body.result.paymentBreakdown.codRemittedAmount).toBe(60);
    expect(reconcilePartial.body.result.paymentBreakdown.codPendingAmount).toBe(65);
    expect(reconcilePartial.body.result.paymentStatus).toBe("PARTIALLY_REMITTED");

    const reconcileFinal = await request(app)
      .post(`/api/orders/${orderId}/cod/reconcile`)
      .set("Authorization", `Bearer ${adminToken}`)
      .send({ amount: 65, deliveryPartnerId: String(rider._id) });
    expect(reconcileFinal.status).toBe(200);
    expect(reconcileFinal.body.result.paymentBreakdown.codRemittedAmount).toBe(125);
    expect(reconcileFinal.body.result.paymentBreakdown.codPendingAmount).toBe(0);
    expect(reconcileFinal.body.result.paymentStatus).toBe("COD_RECONCILED");

    const riderWallet = await Wallet.findOne({
      ownerType: "DELIVERY_PARTNER",
      ownerId: rider._id,
    }).lean();
    const adminWallet = await Wallet.findOne({
      ownerType: "ADMIN",
      ownerId: null,
    }).lean();
    const codOrder = await Order.findOne({ orderId }).lean();

    expect(riderWallet.cashInHand).toBe(0);
    expect(adminWallet.availableBalance).toBe(125);
    expect(codOrder.paymentBreakdown.codPendingAmount).toBe(0);

    const summaryRes = await request(app)
      .get("/api/admin/finance/summary")
      .set("Authorization", `Bearer ${adminToken}`);
    expect(summaryRes.status).toBe(200);
    expect(summaryRes.body.result.systemFloatCOD).toBe(0);
    expect(summaryRes.body.result.reconciledCODInflows).toBe(125);
    expect(summaryRes.body.result.sellerPendingPayouts).toBe(90);
    expect(summaryRes.body.result.deliveryPendingPayouts).toBe(35);

    const codLedger = await LedgerEntry.find({ orderId: codOrder._id }).lean();
    const codTypes = codLedger.map((entry) => entry.type);
    expect(codTypes).toEqual(
      expect.arrayContaining([
        "ORDER_COD_COLLECTED",
        "COD_REMITTED",
        "SELLER_PAYOUT_PENDING",
        "RIDER_PAYOUT_PENDING",
      ]),
    );
  });
});
