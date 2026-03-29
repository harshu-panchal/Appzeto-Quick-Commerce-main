import mongoose from "mongoose";
import Admin from "../models/admin.js";
import User from "../models/customer.js";
import Seller from "../models/seller.js";
import Delivery from "../models/delivery.js";
import Order from "../models/order.js";
import Product from "../models/product.js";
import Transaction from "../models/transaction.js";
import Notification from "../models/notification.js";
import Setting from "../models/setting.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { getAdminFinanceSummary } from "../services/finance/walletService.js";
import { getLedgerEntries } from "../services/finance/ledgerService.js";

const SELLER_DOC_LABELS = {
  tradeLicense: "Trade License",
  gstCertificate: "GST Certificate",
  idProof: "ID Proof",
  businessRegistration: "Business Registration",
  fssaiLicense: "FSSAI License",
  other: "Other Document",
};

function formatSellerDocuments(documents) {
  if (!documents || typeof documents !== "object") {
    return [];
  }

  return Object.entries(documents)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => SELLER_DOC_LABELS[key] || key.replace(/([A-Z])/g, " $1").trim());
}

function formatSellerApplication(seller) {
  const docs = formatSellerDocuments(seller.documents);
  const createdAt = seller.createdAt ? new Date(seller.createdAt) : new Date();
  const missingInfo = !seller.address || docs.length < 3;

  return {
    id: String(seller._id),
    shopName: seller.shopName || "Unnamed Store",
    ownerName: seller.name || "Unnamed Owner",
    email: seller.email || "",
    phone: seller.phone || "",
    category: seller.category || "General",
    applicationDate: createdAt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }),
    receivedAt: createdAt.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    status: seller.applicationStatus || (seller.isVerified ? "approved" : "pending"),
    documents: docs,
    location: seller.address || "Not provided",
    description: seller.description || "No application note provided.",
    verificationScore: docs.length
      ? Math.min(100, 55 + docs.length * 12 + (seller.address ? 10 : 0))
      : 40,
    missingInfo,
  };
}

function escapeRegExp(value = "") {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getSellerDisplayLocation(seller) {
  if (seller.address) return seller.address;
  const coords = seller.location?.coordinates;
  if (Array.isArray(coords) && coords.length === 2) {
    const [lng, lat] = coords;
    if (Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      return `${Number(lat).toFixed(4)}, ${Number(lng).toFixed(4)}`;
    }
  }
  return "Location not set";
}

function sortActiveSellerRows(rows, sortBy) {
  const safeRows = [...rows];
  const sorters = {
    recent: (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime(),
    oldest: (a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime(),
    name_asc: (a, b) => a.shopName.localeCompare(b.shopName),
    name_desc: (a, b) => b.shopName.localeCompare(a.shopName),
    revenue_desc: (a, b) => (b.totalRevenue || 0) - (a.totalRevenue || 0),
    revenue_asc: (a, b) => (a.totalRevenue || 0) - (b.totalRevenue || 0),
    orders_desc: (a, b) => (b.totalOrders || 0) - (a.totalOrders || 0),
    orders_asc: (a, b) => (a.totalOrders || 0) - (b.totalOrders || 0),
    products_desc: (a, b) => (b.productCount || 0) - (a.productCount || 0),
    products_asc: (a, b) => (a.productCount || 0) - (b.productCount || 0),
  };

  const compare = sorters[sortBy] || sorters.recent;
  return safeRows.sort(compare);
}

/* ===============================
   GET ADMIN DASHBOARD STATS
================================ */
export const getAdminStats = async (req, res) => {
  try {
    // 1. Basic Counts
    const [totalCustomers, totalSellers, totalRiders, totalOrders] =
      await Promise.all([
        User.countDocuments({ role: "user" }),
        Seller.countDocuments(),
        Delivery.countDocuments(),
        Order.countDocuments(),
      ]);

    const totalUsers = totalCustomers + totalSellers + totalRiders;
    const activeSellers = await Seller.countDocuments({ isVerified: true });

    // 2. Revenue calculation
    const revenueData = await Order.aggregate([
      { $match: { status: "delivered" } },
      { $group: { _id: null, total: { $sum: "$pricing.total" } } },
    ]);
    const totalRevenue = revenueData[0]?.total || 0;

    // 3. Revenue History (Last 7 Days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const historyAggregation = await Order.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, status: "delivered" } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          revenue: { $sum: "$pricing.total" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Map aggregation to day names for frontend
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const revenueHistory = historyAggregation.map((item) => ({
      name: days[new Date(item._id).getDay()],
      revenue: item.revenue,
    }));

    // 4. Recent Orders
    const recentOrders = await Order.find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate("customer", "name");

    // 5. Category Distribution (Mock logic for now based on orders if products don't have categories)
    // Actually, products DO have categories. Let's aggregate from products or orders.
    const categoryData = await Product.aggregate([
      { $group: { _id: "$headerId", count: { $sum: 1 } } },
      {
        $lookup: {
          from: "categories",
          localField: "_id",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: "$category" },
      { $project: { name: "$category.name", value: "$count" } },
      { $limit: 4 },
    ]);

    // 6. Top Products
    const topProducts = await Order.aggregate([
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.product",
          sales: { $sum: "$items.quantity" },
          revenue: { $sum: { $multiply: ["$items.quantity", "$items.price"] } },
        },
      },
      { $sort: { sales: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $project: {
          name: "$product.name",
          sales: 1,
          rev: "$revenue",
          icon: { $literal: "📦" },
        },
      },
    ]);

    return handleResponse(res, 200, "Admin stats fetched successfully", {
      overview: {
        totalUsers,
        activeSellers,
        totalOrders,
        totalRevenue,
      },
      revenueHistory,
      recentOrders: recentOrders.map((o) => ({
        id: o.orderId,
        customer: o.customer?.name || "Guest",
        statusText: o.status,
        status:
          o.status === "delivered"
            ? "success"
            : o.status === "cancelled"
              ? "error"
              : "warning",
        amount: `₹${o.pricing.total}`,
        time: "Recently",
      })),
      categoryData: categoryData.map((c, i) => ({
        ...c,
        color: ["#4f46e5", "#10b981", "#f59e0b", "#ef4444"][i % 4],
      })),
      topProducts: topProducts.map((p) => ({
        name: p.name,
        sales: p.sales,
        rev: `₹${p.rev.toFixed(2)}`,
        trend: "+5%", // Mock trend for now
        cat: "Product",
        icon: "📦",
        color: "bg-blue-50 text-blue-600",
      })),
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   PLATFORM SETTINGS (Admin)
================================ */
export const getPlatformSettings = async (req, res) => {
  try {
    let settings = await Setting.findOne({});

    if (!settings) {
      settings = await Setting.create({});
    }

    return handleResponse(
      res,
      200,
      "Platform settings fetched successfully",
      settings,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

export const updatePlatformSettings = async (req, res) => {
  try {
    const payload = req.body || {};

    // We keep a single settings document for the platform
    const settings = await Setting.findOneAndUpdate(
      {},
      { $set: payload },
      { new: true, upsert: true },
    );

    return handleResponse(
      res,
      200,
      "Platform settings updated successfully",
      settings,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ADMIN PROFILE
================================ */
export const getAdminProfile = async (req, res) => {
  try {
    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }
    return handleResponse(
      res,
      200,
      "Admin profile fetched successfully",
      admin,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE ADMIN PROFILE
================================ */
export const updateAdminProfile = async (req, res) => {
  try {
    const { name, email } = req.body;

    const admin = await Admin.findById(req.user.id);
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    if (name) admin.name = name;
    if (email) admin.email = email;

    const updatedAdmin = await admin.save();

    return handleResponse(
      res,
      200,
      "Admin profile updated successfully",
      updatedAdmin,
    );
  } catch (error) {
    if (error.code === 11000) {
      return handleResponse(res, 400, "Email already in use");
    }
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE ADMIN PASSWORD
================================ */
export const updateAdminPassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const admin = await Admin.findById(req.user.id).select("+password");
    if (!admin) {
      return handleResponse(res, 404, "Admin not found");
    }

    const isMatch = await admin.comparePassword(currentPassword);
    if (!isMatch) {
      return handleResponse(res, 401, "Invalid current password");
    }

    admin.password = newPassword;
    await admin.save();

    return handleResponse(res, 200, "Password updated successfully");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET DELIVERY PARTNERS (Admin Only)
================================ */
export const getDeliveryPartners = async (req, res) => {
  try {
    const { status, verified } = req.query;
    let query = {};

    if (status === "online") {
      query.isOnline = true;
    } else if (status === "offline") {
      query.isOnline = false;
    }

    if (verified === "true") {
      query.isVerified = true;
    } else if (verified === "false") {
      query.isVerified = false;
    }

    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const [deliveryPartners, total] = await Promise.all([
      Delivery.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Delivery.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Delivery partners fetched successfully", {
      items: deliveryPartners,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET PENDING SELLER APPLICATIONS
================================ */
export const getPendingSellers = async (req, res) => {
  try {
    const { q = "", status = "pending" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const normalizedStatus = String(status || "pending").trim().toLowerCase();
    let baseStatusQuery = { isVerified: { $ne: true } };
    if (normalizedStatus === "pending") {
      baseStatusQuery = {
        isVerified: { $ne: true },
        $or: [
          { applicationStatus: "pending" },
          { applicationStatus: { $exists: false } },
          { applicationStatus: null },
        ],
      };
    } else if (normalizedStatus !== "all") {
      baseStatusQuery = {
        isVerified: { $ne: true },
        applicationStatus: normalizedStatus,
      };
    }

    const conditions = [baseStatusQuery];
    if (q) {
      const regex = new RegExp(q, "i");
      conditions.push({
        $or: [
        { name: regex },
        { shopName: regex },
        { email: regex },
        { phone: regex },
        { address: regex },
        ],
      });
    }
    const query = conditions.length > 1 ? { $and: conditions } : conditions[0];

    const [sellers, total, allPendingForStats] =
      await Promise.all([
        Seller.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Seller.countDocuments(query),
        Seller.find({
          isVerified: { $ne: true },
          $or: [
            { applicationStatus: "pending" },
            { applicationStatus: { $exists: false } },
          ],
        })
          .select("address documents createdAt")
          .lean(),
      ]);

    const items = sellers.map(formatSellerApplication);
    const totalApplications = allPendingForStats.length;
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const receivedToday = allPendingForStats.filter(
      (seller) => seller.createdAt && new Date(seller.createdAt) >= todayStart,
    ).length;
    const missingInfo = allPendingForStats.filter((seller) => {
      const docs = formatSellerDocuments(seller.documents);
      return !seller.address || docs.length < 3;
    }).length;

    return handleResponse(res, 200, "Pending seller applications fetched", {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      stats: {
        totalApplications,
        receivedToday,
        missingInfo,
        avgReviewTimeHours: 24,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   APPROVE SELLER APPLICATION
================================ */
export const approveSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;

    const seller = await Seller.findByIdAndUpdate(
      id,
      {
        $set: {
          isVerified: true,
          isActive: true,
          applicationStatus: "approved",
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
          rejectionReason: null,
        },
      },
      { new: true },
    );

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller approved successfully", formatSellerApplication(seller));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REJECT SELLER APPLICATION
================================ */
export const rejectSellerApplication = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body || {};

    const seller = await Seller.findByIdAndUpdate(
      id,
      {
        $set: {
          isVerified: false,
          isActive: false,
          applicationStatus: "rejected",
          reviewedAt: new Date(),
          reviewedBy: req.user.id,
          rejectionReason: reason || "",
        },
      },
      { new: true },
    );

    if (!seller) {
      return handleResponse(res, 404, "Seller not found");
    }

    return handleResponse(res, 200, "Seller application rejected", formatSellerApplication(seller));
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   APPROVE DELIVERY PARTNER
================================ */
export const approveDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndUpdate(
      id,
      { isVerified: true },
      { new: true },
    );

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider approved successfully", rider);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   REJECT DELIVERY PARTNER
================================ */
export const rejectDeliveryPartner = async (req, res) => {
  try {
    const { id } = req.params;
    const rider = await Delivery.findByIdAndDelete(id);

    if (!rider) {
      return handleResponse(res, 404, "Rider not found");
    }

    return handleResponse(res, 200, "Rider application rejected and removed");
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ACTIVE FLEET (Admin Only)
================================ */
export const getActiveFleet = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = {
      deliveryBoy: { $ne: null },
      status: { $in: ["confirmed", "packed", "shipped", "out_for_delivery"] },
    };

    const [activeOrders, total] = await Promise.all([
      Order.find(query)
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("deliveryBoy", "name phone documents vehicleType")
        .populate("seller", "shopName address name")
        .populate("customer", "name phone")
        .lean(),
      Order.countDocuments(query),
    ]);

    const fleetData = activeOrders.map((order) => ({
      id: order.orderId,
      status:
        order.status === "out_for_delivery"
          ? "On the Way"
          : order.status === "packed"
            ? "At Pickup"
            : order.status === "shipped"
              ? "In Transit"
              : "Assigned",
      deliveryBoy: {
        name: order.deliveryBoy?.name || "Unknown",
        phone: order.deliveryBoy?.phone || "N/A",
        id: order.deliveryBoy?._id || "N/A",
        vehicle: order.deliveryBoy?.vehicleType || "N/A",
        image:
          order.deliveryBoy?.documents?.profileImage ||
          "https://via.placeholder.com/200",
      },
      seller: {
        name: order.seller?.shopName || order.seller?.name || "Unknown",
      },
      customer: {
        name: order.customer?.name || "Guest",
        phone: order.customer?.phone || "N/A",
      },
      lastUpdate: order.updatedAt,
    }));

    return handleResponse(res, 200, "Active fleet fetched successfully", {
      items: fleetData,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ADMIN WALLET DATA
================================ */
export const getAdminWalletData = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 100,
    });

    const stats = await getAdminFinanceSummary();
    const ledger = await getLedgerEntries({ page, limit });
    const transactionItems = ledger.items.map((entry) => ({
      id: entry.transactionId || entry.reference || String(entry._id),
      type: entry.type,
      amount: entry.direction === "DEBIT" ? -Math.abs(entry.amount || 0) : Math.abs(entry.amount || 0),
      status: entry.status,
      sender: entry.direction === "DEBIT" ? entry.actorType : "System/Order",
      recipient: entry.direction === "CREDIT" ? entry.actorType : "Platform Wallet",
      date: new Date(entry.createdAt).toLocaleDateString(),
      time: new Date(entry.createdAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      notes: entry.description || entry.type,
      method: entry.paymentMode || "N/A",
    }));

    return handleResponse(res, 200, "Admin wallet data fetched", {
      stats: {
        totalPlatformEarning: stats.totalPlatformEarning,
        totalAdminEarning: stats.totalAdminEarning,
        availableBalance: stats.availableBalance,
        sellerPendingPayouts: stats.sellerPendingPayouts,
        deliveryPendingPayouts: stats.deliveryPendingPayouts,
        systemFloat: stats.systemFloatCOD,
      },
      transactions: {
        items: transactionItems,
        page: ledger.page,
        limit: ledger.limit,
        total: ledger.total,
        totalPages: ledger.totalPages,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET DELIVERY TRANSACTIONS (Admin)
================================ */
export const getDeliveryTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = { userModel: "Delivery" };

    const transactions = await Transaction.find(query)
      .populate("user", "name phone documents")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Transaction.countDocuments(query);

    return handleResponse(res, 200, "Delivery transactions fetched", {
      items: transactions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER WITHDRAWALS (Admin)
================================ */
export const getSellerWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = { userModel: "Seller", type: "Withdrawal" };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate("user", "name shopName phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Seller withdrawals fetched", {
      items: transactions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET SELLER TRANSACTIONS (Admin)
================================ */
export const getSellerTransactions = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = { userModel: "Seller" };

    const transactions = await Transaction.find(query)
      .populate("user", "name shopName phone bankDetails")
      .populate({
        path: "order",
        select: "orderId pricing",
        populate: {
          path: "items.product",
          select: "name",
        },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Transaction.countDocuments(query);

    return handleResponse(res, 200, "Seller transactions fetched", {
      items: transactions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET DELIVERY WITHDRAWALS (Admin)
================================ */
export const getDeliveryWithdrawals = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = { userModel: "Delivery", type: "Withdrawal" };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .populate("user", "name phone")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(query),
    ]);

    return handleResponse(res, 200, "Delivery withdrawals fetched", {
      items: transactions,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   UPDATE WITHDRAWAL STATUS (Admin)
================================ */
export const updateWithdrawalStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reason } = req.body;

    if (!["Settled", "Failed", "Processing"].includes(status)) {
      return handleResponse(res, 400, "Invalid status");
    }

    const transaction = await Transaction.findById(id).populate("user", "name");
    if (!transaction) {
      return handleResponse(res, 404, "Transaction not found");
    }

    transaction.status = status;
    if (reason) transaction.notes = reason;
    await transaction.save();

    return handleResponse(res, 200, `Withdrawal ${status} successfully`);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   SETTLE TRANSACTION (Admin)
================================ */
export const settleTransaction = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findByIdAndUpdate(
      id,
      { status: "Settled" },
      { new: true },
    ).populate("user", "name");

    if (!transaction) {
      return handleResponse(res, 404, "Transaction not found");
    }

    // Notify Rider
    await Notification.create({
      recipient: transaction.user._id,
      recipientModel: "Delivery",
      title: "Payment Settled",
      message: `Your payment of ₹${transaction.amount} has been settled.`,
      type: "payment",
      data: { transactionId: transaction._id },
    });

    return handleResponse(
      res,
      200,
      "Transaction settled successfully",
      transaction,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   BULK SETTLE DELIVERY (Admin)
================================ */
export const bulkSettleDelivery = async (req, res) => {
  try {
    const result = await Transaction.updateMany(
      { userModel: "Delivery", status: "Pending" },
      { status: "Settled" },
    );

    return handleResponse(
      res,
      200,
      `${result.modifiedCount} transactions settled successfully`,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET DELIVERY CASH BALANCES (Admin)
================================ */

export const getDeliveryCashBalances = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const ridersPipeline = [
      // 1. Join Transactions (Cash Collection & Settlement)
      {
        $lookup: {
          from: "transactions",
          localField: "_id",
          foreignField: "user",
          as: "allTransactions",
        },
      },
      // 2. Join Orders for counts
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "deliveryBoy",
          as: "allOrders",
        },
      },
      {
        $project: {
          name: 1,
          phone: 1,
          avatar: 1,
          limit: { $ifNull: ["$limit", 5000] },
          documents: 1,
          // Filter Cash Transactions & Calculate currentCash
          currentCash: {
            $reduce: {
              input: {
                $filter: {
                  input: "$allTransactions",
                  as: "t",
                  cond: {
                    $in: ["$$t.type", ["Cash Collection", "Cash Settlement"]],
                  },
                },
              },
              initialValue: 0,
              in: {
                $cond: [
                  { $eq: ["$$this.type", "Cash Collection"] },
                  { $add: ["$$value", "$$this.amount"] },
                  { $subtract: ["$$value", { $abs: "$$this.amount" }] },
                ],
              },
            },
          },
          // Count Pending COD Orders (confirmed etc)
          pendingOrders: {
            $size: {
              $filter: {
                input: "$allOrders",
                as: "o",
                cond: {
                  $and: [
                    {
                      $in: [
                        "$$o.status",
                        [
                          "confirmed",
                          "packed",
                          "picked_up",
                          "out_for_delivery",
                        ],
                      ],
                    },
                    { $in: ["$$o.payment.method", ["cash", "cod"]] },
                  ],
                },
              },
            },
          },
          // Count Total Delivered Orders
          totalOrders: {
            $size: {
              $filter: {
                input: "$allOrders",
                as: "o",
                cond: { $eq: ["$$o.status", "delivered"] },
              },
            },
          },
          // Last Settlement Date
          lastSettlementTxn: {
            $arrayElemAt: [
              {
                $sortArray: {
                  input: {
                    $filter: {
                      input: "$allTransactions",
                      as: "t",
                      cond: { $eq: ["$$t.type", "Cash Settlement"] },
                    },
                  },
                  sortBy: { createdAt: -1 },
                },
              },
              0,
            ],
          },
        },
      },
      {
        $project: {
          id: "$_id",
          name: 1,
          phone: 1,
          avatar: {
            $cond: [
              { $ifNull: ["$documents.profileImage", false] },
              "$documents.profileImage",
              {
                $concat: [
                  "https://api.dicebear.com/7.x/avataaars/svg?seed=",
                  "$name",
                ],
              },
            ],
          },
          currentCash: 1,
          limit: 1,
          status: {
            $cond: [
              { $gt: ["$currentCash", 4500] },
              "critical",
              { $cond: [{ $gt: ["$currentCash", 3000] }, "warning", "safe"] },
            ],
          },
          pendingOrders: 1,
          totalOrders: 1,
          lastSettlement: {
            $ifNull: ["$lastSettlementTxn.createdAt", "Never"],
          },
        },
      },
      {
        $facet: {
          meta: [{ $count: "total" }],
          items: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ];

    const [aggregateResult] = await Delivery.aggregate(ridersPipeline);
    const meta = aggregateResult?.meta?.[0];
    const riders = aggregateResult?.items ?? [];
    const total = meta?.total ?? 0;

    const totalInHand = riders.reduce(
      (acc, r) => acc + (r.currentCash || 0),
      0,
    );
    const overLimitCount = riders.filter(
      (r) => (r.currentCash || 0) >= (r.limit || 5000),
    ).length;

    return handleResponse(res, 200, "Cash balances fetched", {
      items: riders,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      stats: {
        totalInHand,
        overLimitCount,
        avgBalance: riders.length ? totalInHand / riders.length : 0,
      },
    });
  } catch (error) {
    console.error("Aggregation Error:", error);
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   SETTLE RIDER CASH (Admin)
================================ */
export const settleRiderCash = async (req, res) => {
  try {
    const { riderId, amount, method } = req.body;

    if (!riderId || !amount || amount <= 0) {
      return handleResponse(res, 400, "Missing riderId or invalid amount");
    }

    const rider = await Delivery.findById(riderId);
    if (!rider) return handleResponse(res, 404, "Rider not found");

    const settlement = await Transaction.create({
      user: riderId,
      userModel: "Delivery",
      type: "Cash Settlement",
      amount: -Math.abs(amount),
      status: "Settled",
      reference: `CSH-SET-${Date.now()}`,
      notes: `Method: ${method || "Cash"}`,
    });

    // Notify Rider
    await Notification.create({
      recipient: riderId,
      recipientModel: "Delivery",
      title: "Cash Settled",
      message: `Admin has collected ₹${amount} cash from you. Your balance is updated.`,
      type: "payment",
      data: { transactionId: settlement._id },
    });
    return handleResponse(res, 201, "Cash settled successfully", settlement);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET RIDER CASH DETAILS (Admin)
================================ */
export const getRiderCashDetails = async (req, res) => {
  try {
    const { id: riderId } = req.params;
    const transactions = await Transaction.find({
      user: riderId,
      userModel: "Delivery",
      type: "Cash Collection",
    })
      .populate("order", "orderId pricing createdAt")
      .sort({ createdAt: -1 })
      .limit(20);

    const formatted = transactions.map((t) => ({
      id: t.order?.orderId || t.reference || "N/A",
      amount: t.amount,
      time: new Date(t.createdAt).toLocaleTimeString("en-IN", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      date: t.createdAt,
    }));

    return handleResponse(res, 200, "Rider cash details fetched", formatted);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET CASH SETTLEMENT HISTORY (Admin)
================================ */
export const getCashSettlementHistory = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const query = { userModel: "Delivery", type: "Cash Settlement" };

    const [history, total] = await Promise.all([
      Transaction.find(query)
        .populate("user", "name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments(query),
    ]);

    const mappedHistory = history.map((h) => ({
      id: (h.reference || h._id).toString(),
      rider: h.user?.name || "Unknown Rider",
      amount: Math.abs(h.amount),
      date: h.createdAt,
      method: h.notes?.replace("Method: ", "") || "Cash Submission",
      status: "completed",
    }));

    return handleResponse(res, 200, "Settlement history fetched", {
      items: mappedHistory,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ACTIVE SELLERS (Admin)
================================ */
export const getActiveSellers = async (req, res) => {
  try {
    const { q = "", category = "all", sort = "recent" } = req.query;
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 20,
      maxLimit: 100,
    });

    const baseQuery = { isVerified: true, isActive: true };
    const filters = [baseQuery];

    if (category && category !== "all") {
      filters.push({ category: new RegExp(`^${escapeRegExp(category)}$`, "i") });
    }

    const search = String(q || "").trim();
    if (search) {
      const regex = new RegExp(escapeRegExp(search), "i");
      filters.push({
        $or: [
          { name: regex },
          { shopName: regex },
          { email: regex },
          { phone: regex },
          { address: regex },
          { category: regex },
        ],
      });
    }

    const query = filters.length > 1 ? { $and: filters } : baseQuery;

    const [sellers, totalActiveCount, allActiveSellers] = await Promise.all([
      Seller.find(query).lean(),
      Seller.countDocuments(baseQuery),
      Seller.find(baseQuery)
        .select("_id createdAt category")
        .lean(),
    ]);

    const sellerIds = sellers.map((seller) => seller._id);
    const allActiveSellerIds = allActiveSellers.map((seller) => seller._id);

    const [ordersBySeller, productsBySeller, overallOrderStats] = await Promise.all([
      sellerIds.length
        ? Order.aggregate([
            { $match: { seller: { $in: sellerIds } } },
            {
              $group: {
                _id: "$seller",
                totalOrders: { $sum: 1 },
                deliveredOrders: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "delivered"] }, 1, 0],
                  },
                },
                pendingOrders: {
                  $sum: {
                    $cond: [
                      {
                        $in: [
                          "$status",
                          ["pending", "confirmed", "packed", "out_for_delivery"],
                        ],
                      },
                      1,
                      0,
                    ],
                  },
                },
                totalRevenue: {
                  $sum: {
                    $cond: [
                      { $eq: ["$status", "delivered"] },
                      { $ifNull: ["$pricing.total", 0] },
                      0,
                    ],
                  },
                },
                lastOrderAt: { $max: "$createdAt" },
              },
            },
          ])
        : Promise.resolve([]),
      sellerIds.length
        ? Product.aggregate([
            { $match: { sellerId: { $in: sellerIds } } },
            {
              $group: {
                _id: "$sellerId",
                productCount: { $sum: 1 },
                activeProductCount: {
                  $sum: {
                    $cond: [{ $eq: ["$status", "active"] }, 1, 0],
                  },
                },
              },
            },
          ])
        : Promise.resolve([]),
      allActiveSellerIds.length
        ? Order.aggregate([
            { $match: { seller: { $in: allActiveSellerIds } } },
              {
                $group: {
                  _id: null,
                  totalOrders: { $sum: 1 },
                  totalRevenue: {
                    $sum: {
                      $cond: [
                        { $eq: ["$status", "delivered"] },
                        { $ifNull: ["$pricing.total", 0] },
                        0,
                      ],
                    },
                  },
                },
              },
            ])
        : Promise.resolve([]),
    ]);

    const orderMap = new Map(
      ordersBySeller.map((row) => [String(row._id), row]),
    );
    const productMap = new Map(
      productsBySeller.map((row) => [String(row._id), row]),
    );

    const enrichedSellers = sellers.map((seller) => {
      const orderStats = orderMap.get(String(seller._id)) || {};
      const productStats = productMap.get(String(seller._id)) || {};
      const totalOrders = Number(orderStats.totalOrders || 0);
      const deliveredOrders = Number(orderStats.deliveredOrders || 0);
      const pendingOrders = Number(orderStats.pendingOrders || 0);
      const totalRevenue = Number(orderStats.totalRevenue || 0);
      const activeProductCount = Number(productStats.activeProductCount || 0);
      const productCount = Number(productStats.productCount || 0);
      const fulfillmentRate = totalOrders
        ? Math.round((deliveredOrders / totalOrders) * 100)
        : 0;
      const joinedAt = seller.reviewedAt || seller.createdAt || new Date();

      return {
        id: String(seller._id),
        _id: seller._id,
        shopName: seller.shopName || "Unnamed Store",
        ownerName: seller.name || "Unnamed Owner",
        email: seller.email || "",
        phone: seller.phone || "",
        category: seller.category || "General",
        status: seller.isVerified && seller.isActive ? "active" : "inactive",
        verificationStatus: seller.isVerified ? "verified" : "unverified",
        joinedAt,
        joinedDate: new Date(joinedAt).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        }),
        lastOrderAt: orderStats.lastOrderAt || null,
        lastOrderLabel: orderStats.lastOrderAt
          ? new Date(orderStats.lastOrderAt).toLocaleDateString("en-GB", {
              day: "2-digit",
              month: "short",
              year: "numeric",
            })
          : "No orders yet",
        totalOrders,
        deliveredOrders,
        pendingOrders,
        totalRevenue,
        avgOrderValue: totalOrders ? totalRevenue / totalOrders : 0,
        fulfillmentRate,
        productCount,
        activeProductCount,
        serviceRadius: Number(seller.serviceRadius || 5),
        location: getSellerDisplayLocation(seller),
        city: seller.address || "Location not set",
        latitude: Array.isArray(seller.location?.coordinates)
          ? seller.location.coordinates[1] ?? null
          : null,
        longitude: Array.isArray(seller.location?.coordinates)
          ? seller.location.coordinates[0] ?? null
          : null,
        avatar: `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
          seller.shopName || seller.name || seller.email || "seller",
        )}`,
      };
    });

    const filteredSortedSellers = sortActiveSellerRows(enrichedSellers, sort);
    const total = filteredSortedSellers.length;
    const pagedItems = filteredSortedSellers.slice(skip, skip + limit);

    const totalRevenue = overallOrderStats[0]?.totalRevenue || 0;
    const totalOrders = overallOrderStats[0]?.totalOrders || 0;
    const newThisMonth = allActiveSellers.filter((seller) => {
      const createdAt = seller.createdAt ? new Date(seller.createdAt) : null;
      if (!createdAt) return false;
      const monthStart = new Date();
      monthStart.setHours(0, 0, 0, 0);
      monthStart.setDate(1);
      return createdAt >= monthStart;
    }).length;

    const highVolume = filteredSortedSellers.filter(
      (seller) => seller.totalOrders >= 100 || seller.totalRevenue >= 100000,
    ).length;

    const uniqueCategories = [
      ...new Set(
        allActiveSellers
          .map((seller) => seller.category)
          .filter(Boolean)
          .map((value) => String(value).trim()),
      ),
    ].sort((a, b) => a.localeCompare(b));

    return handleResponse(res, 200, "Active sellers fetched successfully", {
      items: pagedItems,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
      stats: {
        totalActiveSellers: totalActiveCount,
        totalOrders,
        totalRevenue,
        newThisMonth,
        highVolume,
        averageRevenuePerSeller: totalActiveCount ? totalRevenue / totalActiveCount : 0,
        averageOrdersPerSeller: totalActiveCount ? totalOrders / totalActiveCount : 0,
      },
      filters: {
        categories: uniqueCategories,
      },
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ALL CUSTOMERS (Admin)
================================ */
export const getUsers = async (req, res) => {
  try {
    const { page, limit, skip } = getPagination(req, {
      defaultLimit: 25,
      maxLimit: 200,
    });

    const pipeline = [
      { $match: { role: "user" } },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "customer",
          as: "userOrders",
        },
      },
      {
        $project: {
          id: { $toString: "$_id" },
          name: { $ifNull: ["$name", "Unnamed Customer"] },
          email: 1,
          phone: 1,
          joinedDate: "$createdAt",
          status: {
            $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
          },
          totalOrders: { $size: "$userOrders" },
          totalSpent: { $sum: "$userOrders.pricing.total" },
          lastOrderDate: { $max: "$userOrders.createdAt" },
          avatar: {
            $concat: [
              "https://api.dicebear.com/7.x/avataaars/svg?seed=",
              { $ifNull: ["$name", "Customer"] },
            ],
          },
        },
      },
      { $sort: { totalOrders: -1 } },
    ];

    const [result] = await User.aggregate([
      ...pipeline,
      {
        $facet: {
          totalCount: [{ $count: "count" }],
          items: [{ $skip: skip }, { $limit: limit }],
        },
      },
    ]);

    const total = result?.totalCount?.[0]?.count ?? 0;
    const items = result?.items ?? [];

    return handleResponse(res, 200, "Users fetched successfully", {
      items,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET USER BY ID (Admin)
================================ */
export const getUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.aggregate([
      { $match: { _id: new mongoose.Types.ObjectId(id), role: "user" } },
      {
        $lookup: {
          from: "orders",
          localField: "_id",
          foreignField: "customer",
          as: "userOrders",
        },
      },
      {
        $project: {
          id: { $toString: "$_id" },
          name: { $ifNull: ["$name", "Unnamed Customer"] },
          email: 1,
          phone: 1,
          joinedDate: "$createdAt",
          status: {
            $cond: [{ $eq: ["$isActive", false] }, "inactive", "active"],
          },
          totalOrders: { $size: "$userOrders" },
          totalSpent: { $sum: "$userOrders.pricing.total" },
          lastOrderDate: { $max: "$userOrders.createdAt" },
          avatar: {
            $concat: [
              "https://api.dicebear.com/7.x/avataaars/svg?seed=",
              { $ifNull: ["$name", "Customer"] },
            ],
          },
          addresses: { $ifNull: ["$addresses", []] },
        },
      },
    ]);

    if (!user || user.length === 0) {
      return handleResponse(res, 404, "Customer not found");
    }

    // Fetch recent orders for the timeline
    const recentOrders = await Order.find({ customer: id })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("items.product", "name mainImage");

    const u = user[0];
    const addresses = Array.isArray(u.addresses) ? u.addresses : [];
    const responseData = {
      ...u,
      addresses,
      recentOrders: recentOrders.map((o) => ({
        id: o.orderId,
        _id: o._id,
        itemsCount: o.items.length,
        amount: o.pricing.total,
        date: o.createdAt,
        status: o.status,
      })),
    };

    return handleResponse(
      res,
      200,
      "Customer details fetched successfully",
      responseData,
    );
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};

/* ===============================
   GET ALL SELLERS (Admin) – for offer sections etc.
================================ */
export const getSellers = async (req, res) => {
  try {
    const sellers = await Seller.find({})
      .select("_id shopName name email phone")
      .sort({ shopName: 1 })
      .lean();
    return handleResponse(res, 200, "Sellers fetched", sellers);
  } catch (error) {
    return handleResponse(res, 500, error.message);
  }
};
