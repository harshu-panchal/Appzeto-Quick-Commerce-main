import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import Wallet from "../models/wallet.js";

/* ===============================
   GET SELLER DASHBOARD STATS
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);

        // Date boundaries
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        // Sales Trend date range
        const { range = 'daily' } = req.query;
        let trendStartDate = new Date();
        let aggregationFormat = "%Y-%m-%d";

        if (range === 'monthly') {
            trendStartDate.setMonth(trendStartDate.getMonth() - 6);
            aggregationFormat = "%Y-%m";
        } else if (range === 'weekly') {
            trendStartDate.setDate(trendStartDate.getDate() - 28);
            aggregationFormat = "%Y-%U";
        } else {
            trendStartDate.setDate(trendStartDate.getDate() - 7);
        }

        // Single aggregation pipeline with $facet — replaces 5 separate DB queries
        const [statsResult] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: 'cancelled' },
                }
            },
            {
                $facet: {
                    // Overview totals (replaces Order.find + in-memory reduce)
                    overview: [
                        {
                            $group: {
                                _id: null,
                                totalSales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                totalOrders: { $sum: 1 },
                            }
                        }
                    ],
                    // Current week stats (replaces Order.find with date filter)
                    currentWeek: [
                        { $match: { createdAt: { $gte: sevenDaysAgo } } },
                        {
                            $group: {
                                _id: null,
                                sales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                count: { $sum: 1 },
                            }
                        }
                    ],
                    // Previous week stats (replaces second Order.find)
                    prevWeek: [
                        { $match: { createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
                        {
                            $group: {
                                _id: null,
                                sales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                count: { $sum: 1 },
                            }
                        }
                    ],
                    // Sales trend chart data
                    salesTrend: [
                        { $match: { createdAt: { $gte: trendStartDate } } },
                        {
                            $group: {
                                _id: { $dateToString: { format: aggregationFormat, date: "$createdAt" } },
                                sales: { $sum: { $ifNull: ["$pricing.total", 0] } },
                                orders: { $sum: 1 }
                            }
                        },
                        { $sort: { _id: 1 } }
                    ],
                    // Insights: top cities + peak hours
                    topCities: [
                        { $group: { _id: "$address.city", count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 1 }
                    ],
                    peakHours: [
                        { $project: { hour: { $hour: "$createdAt" } } },
                        { $group: { _id: "$hour", count: { $sum: 1 } } },
                        { $sort: { count: -1 } },
                        { $limit: 1 }
                    ],
                    // Top products with trends (current + prev week via sub-facet)
                    topProductsCurrent: [
                        { $match: { createdAt: { $gte: sevenDaysAgo } } },
                        { $unwind: "$items" },
                        {
                            $group: {
                                _id: "$items.product",
                                name: { $first: "$items.name" },
                                sales: { $sum: "$items.quantity" },
                                revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                            }
                        },
                        { $sort: { sales: -1 } },
                        { $limit: 10 }
                    ],
                    topProductsPrev: [
                        { $match: { createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
                        { $unwind: "$items" },
                        {
                            $group: {
                                _id: "$items.product",
                                sales: { $sum: "$items.quantity" }
                            }
                        }
                    ],
                    // Traffic sources & devices
                    trafficSources: [
                        { $group: { _id: "$trafficSource", value: { $sum: 1 } } },
                        { $project: { name: "$_id", value: 1, _id: 0 } }
                    ],
                    devices: [
                        { $group: { _id: "$deviceType", count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ],
                }
            }
        ]);

        // Extract facet results
        const overviewRaw = statsResult.overview[0] || { totalSales: 0, totalOrders: 0 };
        const totalSales = overviewRaw.totalSales;
        const totalOrders = overviewRaw.totalOrders;
        const avgOrderValue = totalOrders > 0 ? (totalSales / totalOrders) : 0;

        const currentSales = statsResult.currentWeek[0]?.sales || 0;
        const prevSalesVal = statsResult.prevWeek[0]?.sales || 0;
        const salesTrendPerc = prevSalesVal === 0 ? (currentSales > 0 ? 100 : 0) : (((currentSales - prevSalesVal) / prevSalesVal) * 100).toFixed(1);

        const currentOrdersCount = statsResult.currentWeek[0]?.count || 0;
        const prevOrdersCount = statsResult.prevWeek[0]?.count || 0;
        const ordersTrendPerc = prevOrdersCount === 0 ? (currentOrdersCount > 0 ? 100 : 0) : (((currentOrdersCount - prevOrdersCount) / prevOrdersCount) * 100).toFixed(1);

        // Format chart data
        const salesTrend = statsResult.salesTrend;
        let chartData = [];
        if (range === 'monthly') {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const dateStr = d.toISOString().slice(0, 7);
                const data = salesTrend.find(item => item._id === dateStr);
                chartData.push({
                    name: monthNames[d.getMonth()],
                    sales: data ? data.sales : 0,
                    orders: data ? data.orders : 0,
                    traffic: 0
                });
            }
        } else if (range === 'weekly') {
            chartData = salesTrend.map((item, idx) => ({
                name: `Week ${idx + 1}`,
                sales: item.sales,
                orders: item.orders,
                traffic: 0
            })).slice(-4);
        } else {
            const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const dateStr = d.toISOString().split('T')[0];
                const data = salesTrend.find(item => item._id === dateStr);
                chartData.push({
                    name: dayNames[d.getDay()],
                    sales: data ? data.sales : 0,
                    orders: data ? data.orders : 0,
                    traffic: 0
                });
            }
        }

        // Category distribution (separate pipeline — different collection)
        const categoryData = await Product.aggregate([
            { $match: { sellerId: sellerOid } },
            {
                $lookup: {
                    from: "categories",
                    localField: "categoryId",
                    foreignField: "_id",
                    as: "category"
                }
            },
            { $unwind: "$category" },
            {
                $group: {
                    _id: "$category.name",
                    count: { $sum: 1 }
                }
            },
            {
                $project: {
                    subject: "$_id",
                    A: "$count",
                    fullMark: 100
                }
            }
        ]);

        // Format insights
        const topCity = statsResult.topCities[0]?._id || "N/A";
        const peakHour = statsResult.peakHours[0]?._id;
        const peakTime = peakHour !== undefined ? `${peakHour}:00 - ${peakHour + 2}:00` : "N/A";

        // Format top products with trends
        const currentItems = statsResult.topProductsCurrent;
        const prevItems = statsResult.topProductsPrev;

        const formattedTopProducts = currentItems.map(item => {
            const prevItem = prevItems.find(p => p._id.toString() === item._id.toString());
            const currSales = item.sales;
            const pSales = prevItem ? prevItem.sales : 0;

            let trend = 0;
            if (pSales === 0) {
                trend = currSales > 0 ? 100 : 0;
            } else {
                trend = Math.round(((currSales - pSales) / pSales) * 100);
            }

            return {
                name: item.name,
                sales: currSales,
                revenue: `₹${item.revenue.toLocaleString()}`,
                trend: trend
            };
        }).slice(0, 5);

        // Format traffic sources
        const sourceColors = {
            "Direct": "#3b82f6",
            "Search": "#10b981",
            "Social": "#f59e0b",
            "Referral": "#8b5cf6"
        };

        const finalTrafficSources = (statsResult.trafficSources || []).map(s => ({
            ...s,
            color: sourceColors[s.name] || "#CBD5E1"
        }));

        if (finalTrafficSources.length === 0 && totalOrders > 0) {
            finalTrafficSources.push({ name: "Direct", value: totalOrders, color: "#3b82f6" });
        }

        const topDeviceType = statsResult.devices[0]?._id || "Mobile";
        const topDeviceCount = statsResult.devices[0]?.count || 0;
        const devicePerc = totalOrders > 0 ? Math.round((topDeviceCount / totalOrders) * 100) : 0;

        return handleResponse(res, 200, "Stats fetched successfully", {
            overview: {
                totalSales: `₹${totalSales.toLocaleString()}`,
                totalOrders: totalOrders.toLocaleString(),
                avgOrderValue: `₹${Math.round(avgOrderValue).toLocaleString()}`,
                conversionRate: totalOrders > 0 ? "4.2%" : "0%",
                salesTrend: `${salesTrendPerc > 0 ? '+' : ''}${salesTrendPerc}%`,
                ordersTrend: `${ordersTrendPerc > 0 ? '+' : ''}${ordersTrendPerc}%`
            },
            salesTrend: chartData,
            categoryMix: categoryData,
            topProducts: formattedTopProducts,
            trafficSources: finalTrafficSources,
            insights: {
                topCity: topCity,
                peakTime: peakTime,
                topDevice: totalOrders > 0 ? `${devicePerc}% ${topDeviceType}` : "N/A"
            }
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;
        const sellerOid = new mongoose.Types.ObjectId(sellerId);

        const transactions = await Transaction.find({ user: sellerId, userModel: 'Seller' })
            .sort({ createdAt: -1 })
            .populate("order", "orderId");

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => t.type === 'Withdrawal' && (t.status === 'Pending' || t.status === 'Processing'))
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Fetch wallet for live pending balance (money on hold due to return window)
        const wallet = await Wallet.findOne({ ownerType: 'SELLER', ownerId: sellerId });
        const onHoldBalance = wallet ? wallet.pendingBalance : 0;
        const liveAvailableBalance = wallet ? wallet.availableBalance : settledBalance;

        // Keep "Total Revenue" aligned with Dashboard definition:
        // sum of non-cancelled seller orders from Order collection.
        const [orderRevenueAgg] = await Order.aggregate([
            {
                $match: {
                    seller: sellerOid,
                    status: { $ne: 'cancelled' },
                },
            },
            {
                $group: {
                    _id: null,
                    totalRevenue: { $sum: { $ifNull: ["$pricing.total", 0] } },
                },
            },
        ]);
        const totalRevenue = Number(orderRevenueAgg?.totalRevenue || 0);

        const totalWithdrawn = transactions
            .filter(t => t.type === 'Withdrawal' && t.status === 'Settled')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        // Monthly Revenue Aggregation (Last 6 Months)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const monthlyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: new mongoose.Types.ObjectId(sellerId),
                    userModel: 'Seller',
                    type: 'Order Payment',
                    createdAt: { $gte: sixMonthsAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
                    revenue: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const chartData = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date();
            d.setMonth(d.getMonth() - i);
            const dateStr = d.toISOString().slice(0, 7);
            const data = monthlyAggregation.find(m => m._id === dateStr);
            chartData.push({
                name: monthNames[d.getMonth()],
                revenue: data ? data.revenue : 0
            });
        }

        return handleResponse(res, 200, "Earnings fetched successfully", {
            balances: {
                settledBalance: settledBalance,
                pendingPayouts: pendingPayouts,
                onHoldBalance: onHoldBalance, // New field
                availableBalance: liveAvailableBalance, // New field for clarity
                totalRevenue: totalRevenue,
                totalWithdrawn: totalWithdrawn
            },
            monthlyChart: chartData,
            ledger: transactions.map(t => ({
                id: (t.reference || t._id).toString(),
                type: t.type,
                amount: t.amount,
                status: t.status,
                date: t.createdAt.toISOString().split('T')[0],
                time: t.createdAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                customer: t.type === 'Withdrawal' ? 'Bank Transfer' : 'Customer',
                ref: t.order ? `#${t.order.orderId}` : t.reference || t._id
            }))
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
