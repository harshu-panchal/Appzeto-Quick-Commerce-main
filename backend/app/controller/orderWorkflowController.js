import handleResponse from "../utils/helper.js";
import {
  confirmPickupAtomic,
  markArrivedAtStoreAtomic,
  advanceDeliveryRiderUiAtomic,
  requestHandoffOtpAtomic,
  verifyHandoffOtpAndDeliver,
} from "../services/orderWorkflowService.js";
import { getCachedRoute } from "../services/mapsRouteService.js";
import { geocodeAddress } from "../services/mapsGeocodeService.js";
import Order from "../models/order.js";
import Customer from "../models/customer.js";
import Transaction from "../models/transaction.js";
import { orderMatchQueryFromRouteParam } from "../utils/orderLookup.js";
import {
  generateReturnPickupOtp,
  validateReturnPickupOtp,
  generateReturnDropOtp,
  validateReturnDropOtp,
} from "../services/deliveryOtpService.js";
import { emitToCustomer, emitToSeller } from "../services/orderSocketEmitter.js";
import { sendSmsIndiaHubOtp } from "../services/smsIndiaHubService.js";
import { creditWallet } from "../services/finance/walletService.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

export const confirmPickup = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { lat, lng } = req.body || {};
    const result = await confirmPickupAtomic(req.user.id, orderId, lat, lng);
    return handleResponse(res, 200, "Pickup confirmed", result);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

export const markArrivedAtStore = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { lat, lng } = req.body || {};
    const result = await markArrivedAtStoreAtomic(
      req.user.id,
      orderId,
      lat,
      lng,
    );
    return handleResponse(res, 200, "Arrived at store", result);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

export const advanceDeliveryRiderUi = async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await advanceDeliveryRiderUiAtomic(req.user.id, orderId);
    return handleResponse(res, 200, "Delivery progress updated", result);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

export const requestDeliveryOtp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { lat, lng } = req.body || {};
    const result = await requestHandoffOtpAtomic(req.user.id, orderId, lat, lng);
    return handleResponse(res, 200, result.message || "OTP sent", result);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

export const verifyDeliveryOtp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { code } = req.body || {};
    const result = await verifyHandoffOtpAndDeliver(req.user.id, orderId, code);
    return handleResponse(res, 200, "Order delivered", result);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

/**
 * Query: phase=pickup|drop, originLat, originLng (rider position).
 */
export const getOrderRoute = async (req, res) => {
  try {
    const { orderId } = req.params;
    const phase = (req.query.phase || "pickup").toLowerCase();
    const originLat = parseFloat(req.query.originLat);
    const originLng = parseFloat(req.query.originLng);

    if (!Number.isFinite(originLat) || !Number.isFinite(originLng)) {
      return handleResponse(res, 400, "originLat and originLng required");
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    if (!orderKey) {
      return handleResponse(res, 404, "Order not found");
    }

    const order = await Order.findOne(orderKey).populate("seller").lean();

    if (!order) {
      return handleResponse(res, 404, "Order not found");
    }

    const seller = order.seller;
    const coords = seller?.location?.coordinates;
    const hasSellerLoc = Array.isArray(coords) && coords.length >= 2;
    const isReturn = Boolean(order.returnStatus && order.returnStatus !== "none");

    const origin = { lat: originLat, lng: originLng };
    let dest;

    if (phase === "pickup") {
      if (isReturn) {
        const c = order.address?.location;
        let hasCustLoc =
          c &&
          typeof c.lat === "number" &&
          typeof c.lng === "number" &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng);

        if (hasCustLoc) {
          dest = { lat: c.lat, lng: c.lng };
        } else {
          const customer = await Customer.findById(order.customer).lean();
          const fallbackAddress = customer?.addresses?.find(
            (a) =>
              a.label?.toLowerCase() === order.address?.type?.toLowerCase() ||
              a.fullAddress === order.address?.address,
          );

          if (fallbackAddress?.location?.lat && fallbackAddress?.location?.lng) {
            dest = {
              lat: fallbackAddress.location.lat,
              lng: fallbackAddress.location.lng,
            };
            hasCustLoc = true;
          }
        }

        if (!hasCustLoc) {
          return handleResponse(
            res,
            400,
            `Customer delivery location missing for order ${order.orderId}.`,
          );
        }
      } else {
        if (!hasSellerLoc) {
          return handleResponse(res, 400, "Seller location missing or invalid in database");
        }
        dest = { lat: coords[1], lng: coords[0] };
      }
    } else {
      if (isReturn) {
        if (!hasSellerLoc) {
          return handleResponse(res, 400, "Seller location missing or invalid in database");
        }
        dest = { lat: coords[1], lng: coords[0] };
      } else {
        const c = order.address?.location;
        let hasCustLoc =
          c &&
          typeof c.lat === "number" &&
          typeof c.lng === "number" &&
          Number.isFinite(c.lat) &&
          Number.isFinite(c.lng);

        if (hasCustLoc) {
          dest = { lat: c.lat, lng: c.lng };
        } else {
          const customer = await Customer.findById(order.customer).lean();
          const fallbackAddress = customer?.addresses?.find(
            (a) =>
              a.label?.toLowerCase() === order.address?.type?.toLowerCase() ||
              a.fullAddress === order.address?.address,
          );

          if (fallbackAddress?.location?.lat && fallbackAddress?.location?.lng) {
            dest = {
              lat: fallbackAddress.location.lat,
              lng: fallbackAddress.location.lng,
            };
            hasCustLoc = true;
          }
        }

        if (!hasCustLoc) {
          // Last resort: geocode the address text
          const addressText = [
            order.address?.address,
            order.address?.landmark,
            order.address?.city,
          ].filter(Boolean).join(", ");

          if (addressText) {
            try {
              const geocoded = await geocodeAddress(addressText);
              if (geocoded?.lat && geocoded?.lng) {
                dest = { lat: geocoded.lat, lng: geocoded.lng };
                hasCustLoc = true;
              }
            } catch (geocodeErr) {
              console.warn(`[getOrderRoute] Geocode fallback failed for order ${orderId}:`, geocodeErr.message);
            }
          }
        }

        if (!hasCustLoc) {
          return handleResponse(res, 200, "Route", { polyline: null, degraded: true });
        }
      }
    }

    const route = await getCachedRoute(origin, dest, "driving", orderId, phase);
    return handleResponse(res, 200, "Route", { ...route, destination: dest });
  } catch (e) {
    return handleResponse(res, 500, e.message);
  }
};

/**
 * Rider is at customer — request OTP. OTP emitted to customer via socket.
 */
export const requestReturnPickupOtp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const result = await generateReturnPickupOtp(orderId);
    if (!result.success) {
      return handleResponse(res, 400, result.error);
    }

    // ── Emit OTP to customer via Socket.IO/SMS ──────────────────────────────────
    try {
      const customerId = order.customer?.toString();
      if (customerId) {
        emitToCustomer(customerId, {
          event: "return:pickup:otp",
          payload: {
            orderId,
            otp: result.otp,
            expiresAt: result.expiresAt,
            message: `Your return pickup OTP is ${result.otp}. Show this to the delivery partner.`,
          },
        });

        // ── Send SMS to customer (BACKGROUND) ──
        setImmediate(async () => {
          try {
            const customerObj = await Customer.findById(customerId).lean();
            const phone = customerObj?.phone || order.address?.phone;
            if (phone) {
              await sendSmsIndiaHubOtp({
                phone,
                otp: result.otp,
                message: `Your return pickup OTP for order #${orderId} is ${result.otp}. Noyo-kart.`,
              });
            }
          } catch (smsErr) {
            console.warn("[requestReturnPickupOtp] SMS failed:", smsErr.message);
          }
        });
      }
    } catch (socketErr) {
      console.warn("[requestReturnPickupOtp] Notification failed:", socketErr.message);
    }

    return handleResponse(res, 200, "Return pickup OTP sent to customer", {
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

/**
 * Rider enters customer's OTP — verifies pickup. Credits commission to rider.
 * Status: return_pickup_assigned → return_in_transit
 */
export const verifyReturnPickupOtp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { code, otp } = req.body || {};
    const enteredCode = String(code || otp || "").trim();
    const { id: userId } = req.user;

    if (!enteredCode) {
      return handleResponse(res, 400, "OTP code is required");
    }

    const validation = await validateReturnPickupOtp(orderId, enteredCode);
    if (!validation.valid) {
      return handleResponse(res, 400, validation.message, {
        error: validation.error,
        attemptsRemaining: validation.attemptsRemaining,
      });
    }

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    const order = await Order.findOne(orderKey);
    if (!order) return handleResponse(res, 404, "Order not found");

    order.returnStatus = "return_in_transit";
    order.returnPickedAt = new Date();
    await order.save();

    // POPULATE before response to ensure frontend consistency
    await order.populate([
      { path: "seller", select: "name shopName phone location" },
      { path: "address" },
      { path: "customer", select: "name phone" },
      { path: "returnDeliveryBoy", select: "name phone" }
    ]);

    // ── Credit rider commission on successful pickup (BACKGROUND) ────────────
    setImmediate(async () => {
      try {
        const commission = order.returnDeliveryCommission || 0;
        const alreadyPaid = order.financeFlags?.returnPickupCommissionPaid;
        if (commission > 0 && order.returnDeliveryBoy && !alreadyPaid) {
          await creditWallet({
            ownerType: "DELIVERY_PARTNER",
            ownerId: order.returnDeliveryBoy,
            amount: commission,
            bucket: "available",
          });

          await Transaction.create({
            user: order.returnDeliveryBoy,
            userModel: "Delivery",
            order: order._id,
            type: "Delivery Earning",
            amount: commission,
            status: "Settled",
            reference: `RET-PICK-${order.orderId}`,
            meta: { flow: "return_pickup_commission" },
          });

          await Order.updateOne(
            { _id: order._id },
            { $set: { "financeFlags.returnPickupCommissionPaid": true } },
          );
        }
      } catch (commErr) {
        console.error("[verifyReturnPickupOtp] Background commission credit failed:", commErr.message);
      }
    });

    return handleResponse(res, 200, "Return pickup verified. Navigate to seller now.", order);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

/**
 * Rider arrived at seller — request drop OTP. Seller gets it via socket + SMS.
 * Status: return_in_transit → return_drop_pending
 */
export const requestReturnDropOtp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { id: userId } = req.user;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    const order = await Order.findOne(orderKey).populate("seller", "name phone").lean();
    if (!order) return handleResponse(res, 404, "Order not found");

    if (order.returnDeliveryBoy?.toString() !== userId) {
      return handleResponse(res, 403, "Not assigned to this return");
    }

    const allowedStatuses = ["return_in_transit", "return_drop_pending"];
    if (!allowedStatuses.includes(order.returnStatus)) {
      return handleResponse(res, 400, `Cannot request seller OTP in status: ${order.returnStatus}`);
    }

    const result = await generateReturnDropOtp(orderId);
    if (!result.success) {
      return handleResponse(res, 400, result.error);
    }

    // Update to return_drop_pending
    await Order.updateOne({ _id: order._id }, { $set: { returnStatus: "return_drop_pending" } });

    const sellerId = order.seller?._id?.toString() || order.seller?.toString();

    // ── Emit OTP to seller via Socket/SMS ─────────────────────────────────────────
    try {
      if (sellerId) {
        emitToSeller(sellerId, {
          event: "return:drop:otp",
          payload: {
            orderId,
            otp: result.otp,
            expiresAt: result.expiresAt,
            message: `Return drop OTP for order #${orderId}: ${result.otp}. Share with delivery partner to confirm receipt.`,
          },
        });

        // ── Send SMS to seller (BACKGROUND) ──
        setImmediate(async () => {
          try {
            const sellerPhone = order.seller?.phone;
            if (sellerPhone) {
              await sendSmsIndiaHubOtp({
                phone: sellerPhone,
                otp: result.otp,
                message: `Return drop OTP for order #${orderId} is ${result.otp}. Noyo-kart.`,
              });
            }
          } catch (smsErr) {
            console.warn("[requestReturnDropOtp] SMS failed:", smsErr.message);
          }
        });
      }
    } catch (socketErr) {
      console.warn("[requestReturnDropOtp] Socket emit failed:", socketErr.message);
    }


    return handleResponse(res, 200, "Return drop OTP sent to seller via app and SMS", {
      expiresAt: result.expiresAt,
    });
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};

/**
 * Rider enters seller's OTP — product handed over. Status → returned.
 */
export const verifyReturnDropOtp = async (req, res) => {
  try {
    const { orderId } = req.params;
    const { code } = req.body || {};
    const { id: userId } = req.user;

    const orderKey = orderMatchQueryFromRouteParam(orderId);
    const order = await Order.findOne(orderKey);
    if (!order) return handleResponse(res, 404, "Order not found");

    if (order.returnDeliveryBoy?.toString() !== userId) {
      return handleResponse(res, 403, "Not assigned to this return");
    }

    const validation = await validateReturnDropOtp(orderId, code);
    if (!validation.valid) {
      return handleResponse(res, 400, validation.message, {
        error: validation.error,
        attemptsRemaining: validation.attemptsRemaining,
      });
    }

    order.returnStatus = "returned";
    order.returnDeliveredBackAt = new Date();
    order.returnDropVerifiedAt = new Date();
    order.returnDropVerifiedBy = userId;
    await order.save();

    // Notify admin + seller + customer
    try {
      emitNotificationEvent(NOTIFICATION_EVENTS.RETURN_COMPLETED, {
        orderId: order.orderId,
        customerId: order.customer,
        userId: order.customer,
        sellerId: order.seller?._id || order.seller,
        deliveryId: userId,
        data: { message: "Product returned to seller. Admin QC pending." },
      });
    } catch (notifErr) {
      console.warn("[verifyReturnDropOtp] Notification failed:", notifErr.message);
    }

    // POPULATE before response
    await order.populate([
      { path: "seller", select: "name shopName phone location" },
      { path: "customer", select: "name phone" },
      { path: "address" }
    ]);

    return handleResponse(res, 200, "Return delivery complete! Admin will review the product.", order);
  } catch (e) {
    return handleResponse(res, e.statusCode || 500, e.message);
  }
};
