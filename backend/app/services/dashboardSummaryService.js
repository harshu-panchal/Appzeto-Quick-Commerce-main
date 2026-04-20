import DashboardStats from "../models/dashboardStats.js";
import SellerMetrics from "../models/sellerMetrics.js";
import FinanceReports from "../models/financeReports.js";
import Order from "../models/order.js";
import { get, set, buildKey } from "./cacheService.js";
import * as logger from "./logger.js";

/**
 * Dashboard Summary Service
 * 
 * Maintains materialized summaries for dashboard queries to separate
 * read-heavy analytics from transactional writes.
 */

// Configuration
const CACHE_DASHBOARD_TTL = parseInt(process.env.CACHE_DASHBOARD_TTL || "300", 10);
const STALENESS_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
const USE_SECONDARY_PREFERRED = process.env.MONGO_READ_PREFERENCE === "secondaryPreferred";

/**
 * Update dashboard statistic
 * @param {string} metric - Metric name
 * @param {Object} data - Metric data
 * @returns {Promise<void>}
 */
export async function updateDashboardStat(metric, data) {
  try {
    await DashboardStats.findOneAndUpdate(
      { metric },
      {
        $set: { data },
        $currentDate: { lastUpdated: true },
      },
      {
        upsert: true,
        new: true,
      }
    );
    
    // Invalidate cache
    const cacheKey = buildKey("dashboard", "stat", metric);
    await set(cacheKey, null, 0); // Delete cache
    
    logger.debug(`[DashboardSummary] Updated metric: ${metric}`);
    
  } catch (error) {
    logger.error(`[DashboardSummary] Error updating metric ${metric}:`, error);
    throw error;
  }
}

/**
 * Get dashboard statistic with caching
 * @param {string} metric - Metric name
 * @param {Object} filters - Optional filters
 * @returns {Promise<any>}
 */
export async function getDashboardStat(metric, filters = {}) {
  try {
    const cacheKey = buildKey("dashboard", "stat", metric);
    
    // Try cache first
    const cached = await get(cacheKey);
    if (cached) {
      logger.debug(`[DashboardSummary] Cache hit for metric: ${metric}`);
      return cached;
    }
    
    // Fetch from database
    const readOptions = USE_SECONDARY_PREFERRED 
      ? { readPreference: "secondaryPreferred" }
      : {};
    
    const stat = await DashboardStats.findOne({ metric }, null, readOptions).lean();
    
    if (!stat) {
      logger.warn(`[DashboardSummary] Metric not found: ${metric}`);
      return null;
    }
    
    // Cache the result
    await set(cacheKey, stat, CACHE_DASHBOARD_TTL);
    
    return stat;
    
  } catch (error) {
    logger.error(`[DashboardSummary] Error getting metric ${metric}:`, error);
    throw error;
  }
}

/**
 * Check if summary is stale
 * @param {string} metric - Metric name
 * @returns {Promise<{stale: boolean, age: number}>}
 */
export async function checkStaleness(metric) {
  try {
    const stat = await DashboardStats.findOne({ metric }).select("lastUpdated").lean();
    
    if (!stat) {
      return { stale: true, age: Infinity };
    }
    
    const age = Date.now() - new Date(stat.lastUpdated).getTime();
    const stale = age > STALENESS_THRESHOLD_MS;
    
    return { stale, age };
    
  } catch (error) {
    logger.error(`[DashboardSummary] Error checking staleness for ${metric}:`, error);
    return { stale: true, age: Infinity };
  }
}

/**
 * Refresh order count summaries
 * @returns {Promise<void>}
 */
async function refreshOrderCounts() {
  try {
    const counts = await Order.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);
    
    const data = {
      totalOrders: 0,
      pendingOrders: 0,
      confirmedOrders: 0,
      completedOrders: 0,
      cancelledOrders: 0,
    };
    
    counts.forEach(({ _id, count }) => {
      data.totalOrders += count;
      
      if (_id === "pending") data.pendingOrders = count;
      else if (_id === "confirmed") data.confirmedOrders = count;
      else if (_id === "completed") data.completedOrders = count;
      else if (_id === "cancelled") data.cancelledOrders = count;
    });
    
    await updateDashboardStat("order_counts", data);
    logger.debug(`[DashboardSummary] Refreshed order counts: ${data.totalOrders} total`);
    
  } catch (error) {
    logger.error("[DashboardSummary] Error refreshing order counts:", error);
    throw error;
  }
}

/**
 * Refresh seller metrics for a specific date
 * @param {Date} date - Date to refresh (defaults to today)
 * @returns {Promise<void>}
 */
async function refreshSellerMetrics(date = new Date()) {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const metrics = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ["confirmed", "completed"] },
        },
      },
      {
        $group: {
          _id: "$seller",
          orderCount: { $sum: 1 },
          revenue: { $sum: "$pricing.grandTotal" },
          commission: { $sum: "$pricing.platformFee" },
        },
      },
    ]);
    
    // Bulk upsert seller metrics
    const bulkOps = metrics.map(({ _id, orderCount, revenue, commission }) => ({
      updateOne: {
        filter: { sellerId: _id, date: startOfDay },
        update: {
          $set: {
            orderCount,
            revenue,
            commission,
          },
          $currentDate: { lastUpdated: true },
        },
        upsert: true,
      },
    }));
    
    if (bulkOps.length > 0) {
      await SellerMetrics.bulkWrite(bulkOps);
      logger.debug(`[DashboardSummary] Refreshed seller metrics for ${date.toISOString().split('T')[0]}: ${metrics.length} sellers`);
    }
    
  } catch (error) {
    logger.error("[DashboardSummary] Error refreshing seller metrics:", error);
    throw error;
  }
}

/**
 * Refresh finance reports for a specific date
 * @param {Date} date - Date to refresh (defaults to today)
 * @returns {Promise<void>}
 */
async function refreshFinanceReports(date = new Date()) {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const report = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: startOfDay, $lte: endOfDay },
          status: { $in: ["confirmed", "completed"] },
        },
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$pricing.grandTotal" },
          totalCommission: { $sum: "$pricing.platformFee" },
          orderCount: { $sum: 1 },
        },
      },
    ]);
    
    const data = report[0] || {
      totalRevenue: 0,
      totalCommission: 0,
      orderCount: 0,
    };
    
    // Calculate total payouts (revenue - commission)
    data.totalPayouts = data.totalRevenue - data.totalCommission;
    
    await FinanceReports.findOneAndUpdate(
      { date: startOfDay },
      {
        $set: {
          totalRevenue: data.totalRevenue,
          totalCommission: data.totalCommission,
          totalPayouts: data.totalPayouts,
          orderCount: data.orderCount,
        },
        $currentDate: { lastUpdated: true },
      },
      {
        upsert: true,
        new: true,
      }
    );
    
    logger.debug(`[DashboardSummary] Refreshed finance report for ${date.toISOString().split('T')[0]}: ${data.orderCount} orders, ${data.totalRevenue} revenue`);
    
  } catch (error) {
    logger.error("[DashboardSummary] Error refreshing finance reports:", error);
    throw error;
  }
}

/**
 * Refresh all dashboard summaries
 * @returns {Promise<void>}
 */
export async function refreshAllSummaries() {
  try {
    logger.info("[DashboardSummary] Starting full refresh of all summaries...");
    
    const today = new Date();
    
    await Promise.all([
      refreshOrderCounts(),
      refreshSellerMetrics(today),
      refreshFinanceReports(today),
    ]);
    
    logger.debug("[DashboardSummary] All summaries refreshed successfully");
    
  } catch (error) {
    logger.error("[DashboardSummary] Error refreshing all summaries:", error);
    throw error;
  }
}

export default {
  updateDashboardStat,
  getDashboardStat,
  checkStaleness,
  refreshAllSummaries,
};
