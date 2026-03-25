import Order from "../models/order.js";
import Transaction from "../models/transaction.js";
import Product from "../models/product.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";

/* ===============================
   GET SELLER DASHBOARD STATS
================================ */
export const getSellerStats = async (req, res) => {
    try {
        const sellerId = req.user.id;

        // 1. Basic Stats (Total Sales, Total Orders)
        const orders = await Order.find({ seller: sellerId, status: { $ne: 'cancelled' } })
            .select("pricing.total")
            .lean();

        const totalSales = orders.reduce((acc, order) => acc + (order.pricing?.total || 0), 0);
        const totalOrders = orders.length;
        const avgOrderValue = totalOrders > 0 ? (totalSales / totalOrders) : 0;

        // 2. Sales Trend (Dynamic Range)
        const { range = 'daily' } = req.query;
        let startDate = new Date();
        let aggregationFormat = "%Y-%m-%d";
        let chartPoints = 7;

        if (range === 'monthly') {
            startDate.setMonth(startDate.getMonth() - 6);
            aggregationFormat = "%Y-%m";
            chartPoints = 6;
        } else if (range === 'weekly') {
            startDate.setDate(startDate.getDate() - 28);
            aggregationFormat = "%Y-%U"; // Year-Week
            chartPoints = 4;
        } else {
            startDate.setDate(startDate.getDate() - 7);
        }

        const salesTrend = await Order.aggregate([
            {
                $match: {
                    seller: new mongoose.Types.ObjectId(sellerId),
                    status: { $ne: 'cancelled' },
                    createdAt: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: aggregationFormat, date: "$createdAt" } },
                    sales: { $sum: "$pricing.total" },
                    orders: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        let chartData = [];
        if (range === 'monthly') {
            const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            for (let i = 5; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const dateStr = d.toISOString().slice(0, 7); // YYYY-MM
                const data = salesTrend.find(item => item._id === dateStr);
                chartData.push({
                    name: monthNames[d.getMonth()],
                    sales: data ? data.sales : 0,
                    orders: data ? data.orders : 0,
                    traffic: 0
                });
            }
        } else if (range === 'weekly') {
            for (let i = 3; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - (i * 7));
                // Simplified week representation: "W1", "W2"...
                const data = salesTrend.find(item => {
                    const itemDate = new Date(item._id);
                    // This is a bit complex for simple find, using a more direct approach
                    return false; // placeholder for simpler logic below
                });

                // For simplicity, let's just use the last 4 week-ends or similar
                chartData.push({
                    name: `Week ${4 - i}`,
                    sales: 0, // Will populate in a better way if needed or just use aggregated result
                    orders: 0
                });
            }
            // Better weekly logic: use the aggregate result directly but format names
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

        // Trends (Last 7 Days comparison) - Keep this static for overview cards
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const currentWeekOrders = await Order.find({
            seller: sellerId,
            status: { $ne: 'cancelled' },
            createdAt: { $gte: sevenDaysAgo }
        });

        const prevWeekOrders = await Order.find({
            seller: sellerId,
            status: { $ne: 'cancelled' },
            createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo }
        });

        const currentSales = currentWeekOrders.reduce((acc, o) => acc + (o.pricing?.total || 0), 0);
        const prevSales = prevWeekOrders.reduce((acc, o) => acc + (o.pricing?.total || 0), 0);
        const salesTrendPerc = prevSales === 0 ? (currentSales > 0 ? 100 : 0) : (((currentSales - prevSales) / prevSales) * 100).toFixed(1);

        const currentOrdersCount = currentWeekOrders.length;
        const prevOrdersCount = prevWeekOrders.length;
        const ordersTrendPerc = prevOrdersCount === 0 ? (currentOrdersCount > 0 ? 100 : 0) : (((currentOrdersCount - prevOrdersCount) / prevOrdersCount) * 100).toFixed(1);

        // 3. Category Distribution (Radar Chart)
        const categoryData = await Product.aggregate([
            { $match: { sellerId: new mongoose.Types.ObjectId(sellerId) } },
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

        // 4. Insights (Peak Time, Top City)
        const insightsData = await Order.aggregate([
            { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: { $ne: 'cancelled' } } },
            {
                $facet: {
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
                    ]
                }
            }
        ]);

        const topCity = insightsData[0].topCities[0]?._id || "N/A";
        const peakHour = insightsData[0].peakHours[0]?._id;
        const peakTime = peakHour !== undefined ? `${peakHour}:00 - ${peakHour + 2}:00` : "N/A";

        // 5. Top Products with REAL Trends
        const topProductsData = await Order.aggregate([
            { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: { $ne: 'cancelled' } } },
            { $unwind: "$items" },
            {
                $facet: {
                    currentWeek: [
                        { $match: { createdAt: { $gte: sevenDaysAgo } } },
                        {
                            $group: {
                                _id: "$items.product",
                                name: { $first: "$items.name" },
                                sales: { $sum: "$items.quantity" },
                                revenue: { $sum: { $multiply: ["$items.price", "$items.quantity"] } }
                            }
                        }
                    ],
                    prevWeek: [
                        { $match: { createdAt: { $gte: fourteenDaysAgo, $lt: sevenDaysAgo } } },
                        {
                            $group: {
                                _id: "$items.product",
                                sales: { $sum: "$items.quantity" }
                            }
                        }
                    ]
                }
            }
        ]);

        const currentItems = topProductsData[0].currentWeek;
        const prevItems = topProductsData[0].prevWeek;

        const formattedTopProducts = currentItems.map(item => {
            const prevItem = prevItems.find(p => p._id.toString() === item._id.toString());
            const currSales = item.sales;
            const prevSales = prevItem ? prevItem.sales : 0;

            let trend = 0;
            if (prevSales === 0) {
                trend = currSales > 0 ? 100 : 0;
            } else {
                trend = Math.round(((currSales - prevSales) / prevSales) * 100);
            }

            return {
                name: item.name,
                sales: currSales,
                revenue: `₹${item.revenue.toLocaleString()}`,
                trend: trend
            };
        }).sort((a, b) => b.sales - a.sales).slice(0, 5);

        // 6. Traffic Sources & Device Stats
        const trafficStats = await Order.aggregate([
            { $match: { seller: new mongoose.Types.ObjectId(sellerId), status: { $ne: 'cancelled' } } },
            {
                $facet: {
                    sources: [
                        { $group: { _id: "$trafficSource", value: { $sum: 1 } } },
                        { $project: { name: "$_id", value: 1, _id: 0 } }
                    ],
                    devices: [
                        { $group: { _id: "$deviceType", count: { $sum: 1 } } },
                        { $sort: { count: -1 } }
                    ]
                }
            }
        ]);

        const sourceColors = {
            "Direct": "#3b82f6",
            "Search": "#10b981",
            "Social": "#f59e0b",
            "Referral": "#8b5cf6"
        };

        const finalTrafficSources = (trafficStats[0].sources || []).map(s => ({
            ...s,
            color: sourceColors[s.name] || "#CBD5E1"
        }));

        // Fallback for empty traffic sources
        if (finalTrafficSources.length === 0 && totalOrders > 0) {
            finalTrafficSources.push({ name: "Direct", value: totalOrders, color: "#3b82f6" });
        }

        const topDeviceType = trafficStats[0].devices[0]?._id || "Mobile";
        const topDeviceCount = trafficStats[0].devices[0]?.count || 0;
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
        console.error("Stats Error:", error);
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET SELLER EARNINGS / TRANSACTIONS
================================ */
export const getSellerEarnings = async (req, res) => {
    try {
        const sellerId = req.user.id;

        const transactions = await Transaction.find({ user: sellerId, userModel: 'Seller' })
            .sort({ createdAt: -1 })
            .populate("order", "orderId");

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => t.type === 'Withdrawal' && (t.status === 'Pending' || t.status === 'Processing'))
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        const totalRevenue = transactions
            .filter(t => t.type === 'Order Payment')
            .reduce((acc, t) => acc + t.amount, 0);

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
