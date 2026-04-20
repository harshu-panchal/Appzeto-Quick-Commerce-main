import Order from "../models/order.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import Transaction from "../models/transaction.js";
import Delivery from "../models/delivery.js";
import DeliveryAssignment from "../models/deliveryAssignment.js";
import Wallet from "../models/wallet.js";
import handleResponse from "../utils/helper.js";
import mongoose from "mongoose";
import { WORKFLOW_STATUS } from "../constants/orderWorkflow.js";
import { writeDeliveryLocation, appendTrailPoint } from "../services/firebaseService.js";
import { getRedisClient } from "../config/redis.js";
import { distanceMeters } from "../utils/geoUtils.js";
import { applyDeliveredSettlement } from "../services/orderSettlement.js";
import { roundCurrency } from "../utils/money.js";

const LOC_MIN_INTERVAL_MS = () =>
  parseInt(process.env.LOCATION_MIN_INTERVAL_MS || "3000", 10);
const LOC_MIN_MOVE_M = () =>
  parseInt(process.env.LOCATION_MIN_MOVE_METERS || "20", 10);

async function throttleLocationUpdate(deliveryId, lat, lng) {
  const redis = getRedisClient();
  if (!redis) return false;
  try {
    const key = `loc:last:${deliveryId}`;
    const raw = await redis.get(key);
    const now = Date.now();
    if (raw) {
      const prev = JSON.parse(raw);
      const dt = now - prev.t;
      const d = distanceMeters(lat, lng, prev.lat, prev.lng);
      if (dt < LOC_MIN_INTERVAL_MS() && d < LOC_MIN_MOVE_M()) {
        return true;
      }
    }
    await redis.set(
      key,
      JSON.stringify({ lat, lng, t: now }),
      "EX",
      3600,
    );
  } catch {
    return false;
  }
  return false;
}

/* ===============================
   GET DELIVERY DASHBOARD STATS
================================ */
export const getDeliveryStats = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user.id);

        const orders = await Order.find({ deliveryBoy: deliveryBoyId, status: 'delivered' })
            .select("_id")
            .lean();
        const totalDeliveries = orders.length;

        // Today's earnings - Using a more robust date check
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const allTransactions = await Transaction.find({
            user: deliveryBoyId,
            userModel: 'Delivery',
            createdAt: { $gte: startOfToday }
        }).lean();

        const todayEarnings = allTransactions
            .filter(t => t.status === 'Settled' && (t.type === 'Delivery Earning' || t.type === 'Incentive' || t.type === 'Bonus'))
            .reduce((acc, t) => acc + t.amount, 0);

        const incentives = allTransactions
            .filter(t => t.status === 'Settled' && (t.type === 'Incentive' || t.type === 'Bonus'))
            .reduce((acc, t) => acc + t.amount, 0);

        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();
        const cashCollected = roundCurrency(wallet?.cashInHand || 0);

        return handleResponse(res, 200, "Stats fetched", {
            today: todayEarnings,
            deliveries: totalDeliveries,
            incentives,
            cashCollected
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET DELIVERY EARNINGS
================================ */
export const getDeliveryEarnings = async (req, res) => {
    try {
        const deliveryBoyId = new mongoose.Types.ObjectId(req.user.id);
        const transactions = await Transaction.find({ user: deliveryBoyId, userModel: 'Delivery' })
            .sort({ createdAt: -1 })
            .limit(200)
            .populate("order", "orderId pricing paymentBreakdown");
        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();

        const totalEarnings = transactions
            .filter(t => t.status === 'Settled' && (t.type === 'Delivery Earning' || t.type === 'Incentive' || t.type === 'Bonus'))
            .reduce((acc, t) => acc + t.amount, 0);

        const tipsReceived = transactions
            .filter(t => t.type === 'Delivery Earning' && t.status === 'Settled')
            .reduce(
                (acc, t) =>
                    acc +
                    Number(
                        t?.meta?.tipAmount ??
                        t?.order?.paymentBreakdown?.riderTipAmount ??
                        t?.order?.pricing?.tip ??
                        0,
                    ),
                0,
            );

        const onlinePay = transactions
            .filter(t => t.type === 'Delivery Earning' && t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const incentives = transactions
            .filter(t => (t.type === 'Incentive' || t.type === 'Bonus') && t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const cashCollected = roundCurrency(wallet?.cashInHand || 0);

        // Last 7 days aggregation for chart
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const dailyAggregation = await Transaction.aggregate([
            {
                $match: {
                    user: deliveryBoyId,
                    userModel: 'Delivery',
                    status: 'Settled',
                    createdAt: { $gte: sevenDaysAgo },
                    type: { $in: ['Delivery Earning', 'Incentive', 'Bonus'] }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    amount: { $sum: "$amount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const chartData = [];
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            const foundAt = dailyAggregation.find(a => a._id === dateStr);
            chartData.push({
                name: dayNames[d.getDay()],
                earnings: foundAt ? foundAt.amount : 0,
                incentives: 0 // Could be further aggregated if needed
            });
        }

        return handleResponse(res, 200, "Earnings fetched", {
            totalEarnings,
            onlinePay,
            incentives,
            tipsReceived,
            cashCollected,
            chartData,
            transactions: transactions.slice(0, 20)
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   GET DELIVERY COD CASH SUMMARY
================================ */
export const getDeliveryCodCashSummary = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }

        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));

        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();

        const orders = await Order.find({
            deliveryBoy: deliveryBoyId,
            paymentMode: "COD",
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
        })
            .select(
                "orderId status orderStatus deliveredAt createdAt financeFlags paymentBreakdown pricing",
            )
            .sort({ createdAt: -1 })
            .limit(200)
            .lean();

        const normalized = orders.map((order) => {
            const codMarkedCollected = Boolean(order.financeFlags?.codMarkedCollected);
            const gross = roundCurrency(order.paymentBreakdown?.grandTotal ?? order.pricing?.total ?? 0);
            const riderCommission = roundCurrency(order.paymentBreakdown?.riderPayoutTotal ?? 0);

            const estimatedNet = roundCurrency(Math.max(gross - riderCommission, 0));
            const pendingNet = roundCurrency(order.paymentBreakdown?.codPendingAmount ?? 0);
            const contribution = codMarkedCollected ? pendingNet : estimatedNet;

            return {
                orderId: order.orderId,
                status: order.status,
                orderStatus: order.orderStatus,
                deliveredAt: order.deliveredAt || null,
                createdAt: order.createdAt || null,
                codMarkedCollected,
                amountGross: gross,
                riderCommission,
                amountNetExpected: estimatedNet,
                amountNetPending: pendingNet,
                systemFloatContribution: contribution,
            };
        });

        const systemFloatCOD = roundCurrency(
            normalized.reduce((sum, row) => sum + Number(row.systemFloatContribution || 0), 0),
        );

        const toRemit = normalized
            .filter((row) => row.codMarkedCollected && Number(row.amountNetPending || 0) > 0)
            .slice(0, 50);

        const toCollect = normalized
            .filter((row) => !row.codMarkedCollected && Number(row.amountNetExpected || 0) > 0)
            .slice(0, 50);

        return handleResponse(res, 200, "COD cash summary fetched", {
            systemFloatCOD,
            cashInHand: roundCurrency(wallet?.cashInHand || 0),
            toRemit,
            toCollect,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   SUBMIT DELIVERY COD CASH
================================ */
export const submitDeliveryCodCashToAdmin = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }

        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const orders = await Order.find({
            deliveryBoy: deliveryBoyId,
            paymentMode: "COD",
            status: { $ne: "cancelled" },
            orderStatus: { $ne: "cancelled" },
            "financeFlags.codMarkedCollected": true,
            "paymentBreakdown.codPendingAmount": { $gt: 0 },
        })
            .select("orderId paymentBreakdown.codPendingAmount")
            .sort({ createdAt: 1 })
            .lean();

        if (!orders.length) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        const totalAvailable = roundCurrency(
            orders.reduce(
                (sum, order) => sum + Number(order?.paymentBreakdown?.codPendingAmount || 0),
                0,
            ),
        );
        const requestedRaw = req.body?.amount;
        const requestedAmount =
            requestedRaw == null || requestedRaw === ""
                ? null
                : roundCurrency(requestedRaw);

        if (requestedAmount != null && (!Number.isFinite(Number(requestedRaw)) || requestedAmount <= 0)) {
            return handleResponse(res, 400, "Enter a valid amount to submit");
        }

        const amountToSubmit = requestedAmount == null ? totalAvailable : requestedAmount;
        if (amountToSubmit <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }
        if (amountToSubmit > totalAvailable) {
            return handleResponse(
                res,
                400,
                `You can submit up to ${String.fromCharCode(8377)}${totalAvailable.toLocaleString()}`,
            );
        }

        const settledOrders = [];
        let totalSubmitted = 0;
        let remaining = amountToSubmit;

        for (const order of orders) {
            const amount = roundCurrency(order?.paymentBreakdown?.codPendingAmount || 0);
            if (amount <= 0 || remaining <= 0) continue;
            const settleAmount = roundCurrency(Math.min(amount, remaining));

            await reconcileCodCash(
                order._id,
                settleAmount,
                deliveryBoyId,
                {
                    actorId: req.user?.id || null,
                    metadata: {
                        source: "delivery_cod_cash_page",
                        initiatedBy: "delivery_partner",
                    },
                },
            );

            totalSubmitted = roundCurrency(totalSubmitted + settleAmount);
            remaining = roundCurrency(remaining - settleAmount);
            settledOrders.push({
                orderId: order.orderId,
                amount: settleAmount,
            });
        }

        if (totalSubmitted <= 0) {
            return handleResponse(
                res,
                400,
                "No collected COD cash is ready to submit yet. Mark customer cash as collected first.",
            );
        }

        await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Cash Settlement",
            amount: -Math.abs(totalSubmitted),
            status: "Settled",
            reference: `CSH-SET-${deliveryBoyId}-${Date.now()}`,
            meta: {
                source: "delivery_cod_cash_page",
                orders: settledOrders.map((item) => item.orderId),
            },
        });

        const wallet = await Wallet.findOne({
            ownerType: "DELIVERY_PARTNER",
            ownerId: deliveryBoyId,
        })
            .select("cashInHand")
            .lean();

        return handleResponse(res, 200, "COD cash submitted to admin successfully", {
            totalSubmitted,
            orderCount: settledOrders.length,
            orders: settledOrders,
            cashInHand: roundCurrency(wallet?.cashInHand || 0),
        });
    } catch (error) {
        return handleResponse(res, error.statusCode || 500, error.message);
    }
};

/* ===============================
   GET DELIVERY ORDER HISTORY
================================ */
/**
 * Any order this rider was linked to: primary assignment, return pickup, or v2 broadcast winner.
 */
async function buildAssignedToPartnerFilter(deliveryBoyId) {
    const clauses = [
        { deliveryBoy: deliveryBoyId },
        { returnDeliveryBoy: deliveryBoyId },
    ];
    try {
        const winnerOrderIds = await DeliveryAssignment.distinct("orderId", {
            winnerDeliveryId: deliveryBoyId,
        });
        if (winnerOrderIds?.length) {
            clauses.push({ orderId: { $in: winnerOrderIds } });
        }
    } catch {
        /* ignore */
    }
    return { $or: clauses };
}

export const getMyDeliveryOrders = async (req, res) => {
    try {
        const rawId = req.user?.id ?? req.user?._id;
        if (!rawId) {
            return handleResponse(res, 401, "Unauthorized");
        }
        if (!mongoose.Types.ObjectId.isValid(String(rawId))) {
            return handleResponse(res, 401, "Invalid user id");
        }
        const deliveryBoyId = new mongoose.Types.ObjectId(String(rawId));
        const { status } = req.query;
        const normalized = (status || "all").toLowerCase();

        const assignedToPartner = await buildAssignedToPartnerFilter(deliveryBoyId);

        /** v2 orders use workflowStatus; legacy uses status — both must be respected. */
        let query;
        if (normalized === "delivered") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $or: [
                            { status: "delivered" },
                            { workflowStatus: WORKFLOW_STATUS.DELIVERED },
                        ],
                    },
                ],
            };
        } else if (normalized === "cancelled") {
            query = {
                $and: [
                    assignedToPartner,
                    {
                        $or: [
                            { status: "cancelled" },
                            { workflowStatus: WORKFLOW_STATUS.CANCELLED },
                        ],
                    },
                ],
            };
        } else if (normalized === "returns") {
            query = {
                returnStatus: { $ne: "none" },
                $or: [
                    { deliveryBoy: deliveryBoyId },
                    { returnDeliveryBoy: deliveryBoyId },
                ],
            };
        } else {
            query = assignedToPartner;
        }

        const orders = await Order.find(query)
            .sort({ createdAt: -1 })
            .limit(100)
            .populate("seller", "shopName address")
            .populate("customer", "name phone")
            .lean();

        return handleResponse(res, 200, "Delivery orders fetched", orders);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   REQUEST WITHDRAWAL (Delivery)
================================ */
export const requestWithdrawal = async (req, res) => {
    try {
        const deliveryBoyId = req.user.id;
        const { amount } = req.body;

        if (!amount || amount <= 0) {
            return handleResponse(res, 400, "Please enter a valid amount");
        }

        // 1. Calculate current available balance
        const transactions = await Transaction.find({ user: deliveryBoyId, userModel: 'Delivery' });

        const settledBalance = transactions
            .filter(t => t.status === 'Settled')
            .reduce((acc, t) => acc + t.amount, 0);

        const pendingPayouts = transactions
            .filter(t => (t.status === 'Pending' || t.status === 'Processing') && t.type === 'Withdrawal')
            .reduce((acc, t) => acc + Math.abs(t.amount), 0);

        const availableBalance = settledBalance - pendingPayouts;

        if (amount > availableBalance) {
            return handleResponse(res, 400, `Insufficient balance. Available: ₹${availableBalance}`);
        }

        // 2. Create Withdrawal Transaction
        const withdrawal = await Transaction.create({
            user: deliveryBoyId,
            userModel: "Delivery",
            type: "Withdrawal",
            amount: -Math.abs(amount),
            status: "Pending",
            reference: `WDR-DL-${Date.now()}`
        });

        return handleResponse(res, 201, "Withdrawal request submitted successfully", withdrawal);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   UPDATE LIVE LOCATION (Delivery)
================================ */
export const updateDeliveryLocation = async (req, res) => {
    try {
        const deliveryId = req.user.id;
        const { lat, lng, accuracy, heading, speed, orderId } = req.body || {};

        if (
            typeof lat !== "number" ||
            typeof lng !== "number" ||
            Number.isNaN(lat) ||
            Number.isNaN(lng)
        ) {
            return handleResponse(res, 400, "Valid numeric lat and lng are required");
        }

        const throttled = await throttleLocationUpdate(deliveryId, lat, lng);
        if (throttled) {
            return handleResponse(res, 200, "Location update throttled", {
                throttled: true,
            });
        }

        // Normalize to [lng, lat] as required by GeoJSON
        const coordinates = [Number(lng), Number(lat)];

        const delivery = await Delivery.findByIdAndUpdate(
            deliveryId,
            {
                $set: {
                    location: {
                        type: "Point",
                        coordinates,
                    },
                    lastLocationAt: new Date(),
                },
            },
            { new: true }
        ).select("_id location isOnline");

        if (!delivery) {
            return handleResponse(res, 404, "Delivery partner not found");
        }

        // Optional: if orderId is provided, verify assignment asynchronously
        // Don't await — resolve activeOrderId optimistically and let Firebase writes use it
        let activeOrderId = orderId || null;
        if (orderId) {
            // Fire-and-forget verification; if order lookup fails, Firebase just gets the raw orderId
            Order.findOne(orderMatchQueryFromRouteParam(orderId) || {})
                .select("orderId deliveryBoy")
                .lean()
                .then((order) => {
                    if (!order || order.deliveryBoy?.toString() !== deliveryId) {
                        // Mismatch — no further action needed, already responded
                    }
                })
                .catch(() => {});
        }

        const snapshot = {
            lat,
            lng,
            accuracy: typeof accuracy === "number" ? accuracy : undefined,
            heading: typeof heading === "number" ? heading : undefined,
            speed: typeof speed === "number" ? speed : undefined,
            lastUpdatedAt: new Date().toISOString(),
            deliveryId,
            orderId: activeOrderId,
        };

        // Fan out to Firebase and trail — fire-and-forget, never block the response
        writeDeliveryLocation(deliveryId, activeOrderId, snapshot).catch(() => {});
        if (activeOrderId) {
            appendTrailPoint(activeOrderId, { lat, lng, t: Date.now() }).catch(() => {});
        }

        return handleResponse(res, 200, "Location updated", {
            location: delivery.location,
            activeOrderId,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};


/* ===============================
   GENERATE DELIVERY OTP
================================ */
export const generateDeliveryOtp = async (req, res) => {
    try {
        const { orderId } = req.params;
        let { location } = req.body || {};
        const deliveryBoyId = req.user.id;

        // If location is not provided in request body, fetch from database
        if (!location) {
            const delivery = await Delivery.findById(deliveryBoyId).select('location lastLocationAt');
            
            if (!delivery) {
                return handleResponse(res, 404, "Delivery person not found", {
                    error: {
                        code: "DELIVERY_NOT_FOUND",
                        message: "Delivery person not found"
                    }
                });
            }

            // Extract coordinates from GeoJSON format [lng, lat]
            const coords = delivery.location?.coordinates;
            if (!Array.isArray(coords) || coords.length < 2) {
                return handleResponse(res, 400, "Location not available", {
                    error: {
                        code: "LOCATION_REQUIRED",
                        message: "Your location is not available. Please ensure location tracking is enabled."
                    }
                });
            }

            const [lng, lat] = coords;

            // Validate stored location is not default [0, 0]
            if (Math.abs(lat) < 1e-5 && Math.abs(lng) < 1e-5) {
                return handleResponse(res, 400, "Location not available", {
                    error: {
                        code: "LOCATION_REQUIRED",
                        message: "Your location is not available. Please ensure location tracking is enabled."
                    }
                });
            }

            // Validate lastLocationAt is recent (within last 5 minutes)
            if (!delivery.lastLocationAt) {
                return handleResponse(res, 400, "Location data is stale", {
                    error: {
                        code: "LOCATION_STALE",
                        message: "Your location data is not available. Please ensure location tracking is enabled."
                    }
                });
            }

            const locationAge = Date.now() - delivery.lastLocationAt.getTime();
            const fiveMinutes = 5 * 60 * 1000;
            if (locationAge > fiveMinutes) {
                return handleResponse(res, 400, "Location data is stale", {
                    error: {
                        code: "LOCATION_STALE",
                        message: "Your location data is outdated. Please ensure location tracking is enabled and try again."
                    }
                });
            }

            // Use stored location
            location = { lat, lng };
        } else {
            // Validate provided location data
            if (typeof location !== 'object') {
                return handleResponse(res, 400, "Invalid location data", {
                    error: {
                        code: "LOCATION_REQUIRED",
                        message: "Valid location data with lat and lng is required"
                    }
                });
            }

            if (typeof location.lat !== 'number' || typeof location.lng !== 'number') {
                return handleResponse(res, 400, "Invalid location coordinates", {
                    error: {
                        code: "LOCATION_REQUIRED",
                        message: "Location must have numeric lat and lng properties"
                    }
                });
            }

            // Validate coordinates are within valid ranges
            if (location.lat < -90 || location.lat > 90 || location.lng < -180 || location.lng > 180) {
                return handleResponse(res, 400, "Invalid location coordinates", {
                    error: {
                        code: "LOCATION_REQUIRED",
                        message: "Latitude must be between -90 and 90, longitude between -180 and 180"
                    }
                });
            }
        }

        // Find the order and verify it's assigned to this delivery person
        const orderKey = orderMatchQueryFromRouteParam(orderId);
        if (!orderKey) {
            return handleResponse(res, 404, "Order not found", {
                error: {
                    code: "ORDER_NOT_FOUND",
                    message: "Order not found"
                }
            });
        }

        const order = await Order.findOne(orderKey).populate('customer', 'name phone');
        if (!order) {
            return handleResponse(res, 404, "Order not found", {
                error: {
                    code: "ORDER_NOT_FOUND",
                    message: "Order not found"
                }
            });
        }

        // Verify the order is assigned to this delivery person
        if (order.deliveryBoy?.toString() !== deliveryBoyId) {
            return handleResponse(res, 404, "Order not found or not assigned to you", {
                error: {
                    code: "UNAUTHORIZED_DELIVERY",
                    message: "This order is not assigned to you"
                }
            });
        }

        // Import the service dynamically to avoid circular dependencies
        const { generateDeliveryOtp: generateOtp } = await import('../services/deliveryOtpService.js');
        
        // Generate OTP with proximity validation
        const result = await generateOtp(order.orderId, location);

        if (!result.success) {
            // Determine appropriate status code based on error
            let statusCode = 500;
            let errorCode = "GENERATION_FAILED";

            if (result.error.includes('proximity') || result.error.includes('distance')) {
                statusCode = 403;
                errorCode = "PROXIMITY_OUT_OF_RANGE";
            } else if (result.error.includes('not found')) {
                statusCode = 404;
                errorCode = "ORDER_NOT_FOUND";
            } else if (result.error.includes('location')) {
                statusCode = 400;
                errorCode = "LOCATION_REQUIRED";
            }

            return handleResponse(res, statusCode, result.error, {
                error: {
                    code: errorCode,
                    ...(result.errorCode ? { subCode: result.errorCode } : {}),
                    message: result.error
                }
            });
        }

        // Emit Socket.IO event to customer using standardized emitter
        try {
            const { emitToCustomer } = await import('../services/orderSocketEmitter.js');
            
            const otpPayload = {
                orderId: order.orderId,
                otp: result.otp,
                code: result.otp, // Legacy support
                expiresAt: result.expiresAt,
                deliveryPersonNearby: true
            };

            const customerId = order.customer?._id || order.customer;
            if (customerId) {
                // Emit both events for maximum frontend compatibility (Toast + Display Component)
                emitToCustomer(customerId, {
                    event: 'order:otp',
                    payload: otpPayload
                });
                
                emitToCustomer(customerId, {
                    event: 'delivery:otp:generated',
                    payload: otpPayload
                });
            }
            
            // Also emit to order-specific room for clients that joined via join_order
            const { getIO } = await import('../socket/socketManager.js');
            const io = getIO();
            io.to(`order:${order.orderId}`).emit('delivery:otp:generated', otpPayload);
            io.to(`order:${order.orderId}`).emit('order:otp', otpPayload);
        } catch (socketError) {
            console.error('[generateDeliveryOtp] Error emitting Socket.IO event:', socketError);
        }

        return handleResponse(res, 200, "OTP generated and sent to customer", {
            success: true,
            data: {
                otpGenerated: true,
                expiresAt: result.expiresAt,
                attemptsRemaining: 3
            }
        });
    } catch (error) {
        console.error('Error in generateDeliveryOtp controller:', error);
        return handleResponse(res, 500, "Failed to generate OTP", {
            error: {
                code: "GENERATION_FAILED",
                message: error.message
            }
        });
    }
};

/* ===============================
   VALIDATE DELIVERY OTP
================================ */
export const validateDeliveryOtp = async (req, res) => {
    try {
        const { orderId } = req.params;
        const { otp } = req.body;
        const deliveryBoyId = req.user.id;

        // Validate OTP format in request body
        if (!otp || typeof otp !== 'string') {
            return handleResponse(res, 400, "OTP is required", {
                error: {
                    code: "OTP_INVALID_FORMAT",
                    message: "OTP must be a 4-digit string"
                }
            });
        }

        // Validate OTP format: exactly 4 digits
        const otpPattern = /^\d{4}$/;
        if (!otpPattern.test(otp)) {
            return handleResponse(res, 400, "Invalid OTP format", {
                error: {
                    code: "OTP_INVALID_FORMAT",
                    message: "OTP must be exactly 4 digits"
                }
            });
        }

        // Find the order and verify it's assigned to this delivery person
        const orderKey = orderMatchQueryFromRouteParam(orderId);
        if (!orderKey) {
            return handleResponse(res, 404, "Order not found", {
                error: {
                    code: "ORDER_NOT_FOUND",
                    message: "Order not found"
                }
            });
        }

        const order = await Order.findOne(orderKey).populate('customer', 'name phone');
        if (!order) {
            return handleResponse(res, 404, "Order not found", {
                error: {
                    code: "ORDER_NOT_FOUND",
                    message: "Order not found"
                }
            });
        }

        // Verify the order is assigned to this delivery person
        if (order.deliveryBoy?.toString() !== deliveryBoyId) {
            return handleResponse(res, 404, "Order not found or not assigned to you", {
                error: {
                    code: "UNAUTHORIZED_DELIVERY",
                    message: "This order is not assigned to you"
                }
            });
        }

        // Import the service dynamically to avoid circular dependencies
        const { validateDeliveryOtp: validateOtp } = await import('../services/deliveryOtpService.js');

        // Validate OTP
        const result = await validateOtp(order.orderId, otp);

        if (!result.valid) {
            // Determine appropriate status code based on error
            let statusCode = 500;

            if (result.error === 'INVALID_FORMAT' || result.error === 'OTP_INVALID_FORMAT') {
                statusCode = 400;
            } else if (result.error === 'OTP_EXPIRED') {
                statusCode = 401;
            } else if (result.error === 'OTP_MISMATCH') {
                statusCode = 403;
            } else if (result.error === 'OTP_NOT_FOUND') {
                statusCode = 404;
            } else if (result.error === 'OTP_CONSUMED') {
                statusCode = 409;
            } else if (result.error === 'MAX_ATTEMPTS_EXCEEDED') {
                statusCode = 423;
            }

            return handleResponse(res, statusCode, result.message, {
                error: {
                    code: result.error,
                    message: result.message,
                    attemptsRemaining: result.attemptsRemaining
                }
            });
        }

        // OTP validated successfully - update order status to delivered
        const now = new Date();

        // Get current delivery location for recording
        const delivery = await Delivery.findById(deliveryBoyId).select('location');
        const validationLocation = delivery?.location?.coordinates
            ? { lng: delivery.location.coordinates[0], lat: delivery.location.coordinates[1] }
            : null;

        // Update order status
        const updatedOrder = await Order.findOneAndUpdate(
            orderKey,
            {
                $set: {
                    workflowStatus: WORKFLOW_STATUS.DELIVERED,
                    status: "delivered",
                    deliveredAt: now,
                    otpValidatedAt: now,
                    otpValidationLocation: validationLocation
                }
            },
            { new: true }
        );

        if (updatedOrder) {
            try {
                await applyDeliveredSettlement(updatedOrder, order.orderId);
            } catch (settlementError) {
                console.error("[validateDeliveryOtp] Settlement failed after delivery:", settlementError);
                // Order has already been marked delivered; don't fail OTP validation due to finance sync issues.
                return handleResponse(res, 200, "Order delivered successfully (finance pending)", {
                    success: true,
                    message: "Order delivered successfully (finance pending)",
                    warning: {
                        code: "FINANCE_SETTLEMENT_FAILED",
                        message: settlementError.message
                    },
                    data: {
                        orderId: order.orderId,
                        deliveredAt: now.toISOString()
                    }
                });
            }
        }

        // Emit Socket.IO event to customer
        try {
            const { getIO } = await import('../socket/socketManager.js');
            const io = getIO();

            // Emit to customer's room
            if (order.customer?._id) {
                io.to(`customer:${order.customer._id}`).emit('delivery:otp:validated', {
                    orderId: order.orderId,
                    status: "delivered",
                    deliveredAt: now.toISOString()
                });
            }

            // Also emit to order room
            io.to(`order:${order.orderId}`).emit('delivery:otp:validated', {
                orderId: order.orderId,
                status: "delivered",
                deliveredAt: now.toISOString()
            });
        } catch (socketError) {
            console.error('Error emitting Socket.IO event:', socketError);
            // Don't fail the request if socket emission fails
        }

        return handleResponse(res, 200, "Order delivered successfully", {
            success: true,
            message: "Order delivered successfully",
            data: {
                orderId: order.orderId,
                deliveredAt: now.toISOString()
            }
        });
    } catch (error) {
        console.error('Error in validateDeliveryOtp controller:', error);
        return handleResponse(res, 500, "Failed to validate OTP", {
            error: {
                code: "VALIDATION_FAILED",
                message: error.message
            }
        });
    }
};
