import crypto from 'crypto';
import Order from '../models/order.js';
import OrderOtp from '../models/orderOtp.js';
import { checkProximity } from './proximityService.js';
import { emitToCustomer, emitOrderStatusUpdate } from './orderSocketEmitter.js';

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function hasValidLatLng(location) {
  if (!location || typeof location !== "object") return false;
  const { lat, lng } = location;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}

function hasMapsKeyConfigured() {
  return Boolean(
    (process.env.GOOGLE_MAPS_API_KEY || "").trim() ||
      (process.env.GOOGLE_MAPS_SERVER_KEY || "").trim(),
  );
}

function buildGeocodeQueryFromOrderAddress(order) {
  const rawParts = [
    order?.address?.address,
    order?.address?.landmark,
    order?.address?.city,
  ];
  const parts = rawParts
    .filter((part) => typeof part === "string")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) return "";
  return parts.join(", ");
}

/**
 * Generate OTP for delivery completion (proximity-validated)
 * @param {string} orderId - Order identifier
 * @param {Object} deliveryLocation - Current delivery person location
 * @param {number} deliveryLocation.lat - Latitude
 * @param {number} deliveryLocation.lng - Longitude
 * @returns {Promise<Object>} { success: boolean, otp?: string, error?: string, expiresAt?: Date }
 */
export async function generateDeliveryOtp(orderId, deliveryLocation) {
  try {
    // Validate input
    if (!orderId || typeof orderId !== 'string') {
      return {
        success: false,
        error: 'Valid orderId is required'
      };
    }

    if (!deliveryLocation || typeof deliveryLocation !== 'object') {
      return {
        success: false,
        error: 'Valid delivery location is required'
      };
    }

    if (typeof deliveryLocation.lat !== 'number' || typeof deliveryLocation.lng !== 'number') {
      return {
        success: false,
        error: 'Delivery location must have numeric lat and lng properties'
      };
    }

    // Find the order
    const order = await Order.findOne({ orderId });
    if (!order) {
      return {
        success: false,
        error: 'Order not found'
      };
    }

    // Check if order has delivery location
    if (!hasValidLatLng(order.address?.location)) {
      // Backward-compat: older orders may not have map-picked coords. Try to derive once via geocoding
      // (only when configured) and persist back to the order for subsequent steps.
      if (hasMapsKeyConfigured()) {
        const query = buildGeocodeQueryFromOrderAddress(order);
        if (query) {
          try {
            const { geocodeAddress } = await import("./mapsGeocodeService.js");
            const geocoded = await geocodeAddress(query);
            if (hasValidLatLng(geocoded)) {
              order.address = order.address || {};
              order.address.location = { lat: geocoded.lat, lng: geocoded.lng };
              await order.save();
            }
          } catch (e) {
            // Don't hard-fail OTP generation on geocode failures; fall back to explicit error below.
            console.warn("[generateDeliveryOtp] Failed to backfill order coordinates:", e?.message || e);
          }
        }
      }

      if (!hasValidLatLng(order.address?.location)) {
        console.error('Order location validation failed:', {
          orderId: order.orderId,
          hasAddress: !!order.address,
          hasLocation: !!order.address?.location,
          location: order.address?.location,
          lat: order.address?.location?.lat,
          lng: order.address?.location?.lng
        });
        return {
          success: false,
          errorCode: "ORDER_LOCATION_REQUIRED",
          error:
            'This order does not have delivery coordinates saved. Please contact support or ask the customer to provide their exact location. The order was likely created before location tracking was enabled.'
        };
      }
    }

    const customerLocation = {
      lat: order.address.location.lat,
      lng: order.address.location.lng
    };

    // Validate proximity
    let proximityCheck;
    try {
      proximityCheck = checkProximity(deliveryLocation, customerLocation);
    } catch (error) {
      return {
        success: false,
        error: `Proximity check failed: ${error.message}`
      };
    }

    if (!proximityCheck.inRange) {
      return {
        success: false,
        error: `Delivery person must be within 0-120 meters of delivery location. Current distance: ${Math.round(proximityCheck.distance)}m`
      };
    }

    // Generate secure 4-digit OTP using crypto.randomInt
    const otp = String(crypto.randomInt(0, 10000)).padStart(4, '0');

    // Hash the OTP for storage
    const codeHash = OrderOtp.hashCode(otp);

    // Set expiration time to 10 minutes from now
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate any previous OTPs for this order
    await OrderOtp.updateMany(
      { orderId, type: 'delivery', consumedAt: null },
      { consumedAt: new Date() }
    );

    // Create new OTP record
    await OrderOtp.create({
      orderId,
      orderMongoId: order._id,
      type: 'delivery',
      codeHash,
      code: otp,
      expiresAt,
      attempts: 0,
      maxAttempts: 3,
      lastGeneratedAt: new Date()
    });

    return {
      success: true,
      otp,
      expiresAt
    };
  } catch (error) {
    console.error('Error generating delivery OTP:', error);
    return {
      success: false,
      error: 'Failed to generate OTP. Please try again.'
    };
  }
}

/**
 * Check if OTP is expired
 * @param {Date} expiresAt - OTP expiration timestamp
 * @returns {boolean}
 */
export function isOtpExpired(expiresAt) {
  return new Date() > new Date(expiresAt);
}

/**
 * Validate OTP entered by delivery person
 * @param {string} orderId - Order identifier
 * @param {string} enteredOtp - 4-digit OTP entered by delivery person
 * @returns {Promise<Object>} { valid: boolean, error?: string, attemptsRemaining?: number }
 */
export async function validateDeliveryOtp(orderId, enteredOtp) {
  try {
    // Validate input format
    if (!orderId || typeof orderId !== 'string') {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        message: 'Valid orderId is required'
      };
    }

    if (!enteredOtp || typeof enteredOtp !== 'string') {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        message: 'OTP is required'
      };
    }

    // Validate OTP format: exactly 4 digits
    const otpPattern = /^\d{4}$/;
    if (!otpPattern.test(enteredOtp)) {
      return {
        valid: false,
        error: 'INVALID_FORMAT',
        message: 'OTP must be exactly 4 digits'
      };
    }

    // Find the latest OTP record for this order. We intentionally do NOT filter on
    // consumedAt here so we can return a more actionable error (expired/consumed)
    // rather than always returning OTP_NOT_FOUND.
    const otpRecord = await OrderOtp.findOne({ orderId, type: 'delivery' }).sort({
      lastGeneratedAt: -1,
      createdAt: -1,
    });

    if (!otpRecord) {
      return {
        valid: false,
        error: 'OTP_NOT_FOUND',
        message: 'No OTP has been generated for this order yet'
      };
    }

    if (otpRecord.consumedAt) {
      return {
        valid: false,
        error: 'OTP_CONSUMED',
        message: 'OTP has already been used. Please generate a new OTP.'
      };
    }

    // Check if max attempts exceeded
    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      return {
        valid: false,
        error: 'MAX_ATTEMPTS_EXCEEDED',
        message: 'Maximum validation attempts exceeded. Supervisor intervention required.',
        attemptsRemaining: 0
      };
    }

    // Check OTP expiration before validation
    if (isOtpExpired(otpRecord.expiresAt)) {
      return {
        valid: false,
        error: 'OTP_EXPIRED',
        message: 'OTP has expired. Please generate a new OTP.',
        attemptsRemaining: otpRecord.maxAttempts - otpRecord.attempts
      };
    }

    // Hash the entered OTP and compare with stored hash
    const enteredHash = OrderOtp.hashCode(enteredOtp);
    const isMatch = enteredHash === otpRecord.codeHash;

    if (!isMatch) {
      // Increment attempts
      otpRecord.attempts += 1;
      await otpRecord.save();

      const attemptsRemaining = otpRecord.maxAttempts - otpRecord.attempts;

      return {
        valid: false,
        error: 'OTP_MISMATCH',
        message: 'Invalid OTP. Please try again.',
        attemptsRemaining
      };
    }

    // OTP is valid - mark as consumed
    otpRecord.consumedAt = new Date();
    await otpRecord.save();

    return {
      valid: true,
      message: 'OTP validated successfully'
    };
  } catch (error) {
    console.error('Error validating delivery OTP:', error);
    return {
      valid: false,
      error: 'VALIDATION_FAILED',
      message: 'Failed to validate OTP. Please try again.'
    };
  }
}

/**
 * Generate OTP for return pickup from customer.
 * @param {string} orderId
 * @returns {Promise<Object>}
 */
export async function generateReturnPickupOtp(orderId, requester = {}) {
  try {
    const order = await Order.findOne({ orderId });
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    if (order.returnStatus !== 'return_pickup_assigned') {
      return { success: false, error: 'Return is not in pickup assigned status.' };
    }

    const requesterId = requester?.id || requester?._id || null;
    const requesterRole = String(requester?.role || '').toLowerCase();
    if (
      requesterRole === 'delivery' &&
      requesterId &&
      order.returnDeliveryBoy &&
      String(order.returnDeliveryBoy) !== String(requesterId)
    ) {
      return { success: false, error: 'This return pickup is assigned to another delivery partner.' };
    }

    // Generate secure 4-digit OTP using crypto.randomInt
    const otp = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    const codeHash = OrderOtp.hashCode(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    // Invalidate any previous return OTPs for this order
    await OrderOtp.updateMany(
      { orderId, type: 'return_pickup', consumedAt: null },
      { consumedAt: new Date() }
    );

    // Create new OTP record
    await OrderOtp.create({
      orderId,
      orderMongoId: order._id,
      type: 'return_pickup',
      codeHash,
      code: otp,
      expiresAt,
      attempts: 0,
      maxAttempts: 3,
      lastGeneratedAt: new Date()
    });

    // Keep payload shape consistent with customer-side listeners.
    if (order.customer) {
      const customerId = String(order.customer);
      emitToCustomer(customerId, {
        event: 'order:otp',
        payload: {
          orderId,
          code: otp,
          expiresAt,
          type: 'return_pickup',
        },
      });
      emitToCustomer(customerId, {
        event: 'delivery:otp:generated',
        payload: {
          orderId,
          otp,
          expiresAt,
          deliveryPersonNearby: true,
          type: 'return_pickup',
        },
      });
      emitOrderStatusUpdate(orderId, { returnOtpSent: true }, order.customer);
    }

    return { success: true, otp, expiresAt };
  } catch (error) {
    console.error('Error generating return pickup OTP:', error);
    return { success: false, error: 'Failed to generate OTP.' };
  }
}

/**
 * Validate OTP entered by delivery person for return pickup.
 * @param {string} orderId
 * @param {string} enteredOtp
 * @returns {Promise<Object>}
 */
export async function validateReturnPickupOtp(orderId, enteredOtp) {
  try {
    if (!orderId || !enteredOtp) {
      return { valid: false, error: 'INVALID_FORMAT', message: 'orderId and OTP are required' };
    }

    // Find the latest return_pickup OTP record
    const otpRecord = await OrderOtp.findOne({ orderId, type: 'return_pickup' }).sort({
      lastGeneratedAt: -1,
      createdAt: -1,
    });

    if (!otpRecord) {
      return { valid: false, error: 'OTP_NOT_FOUND', message: 'No return OTP found.' };
    }

    if (otpRecord.consumedAt) {
      return { valid: false, error: 'OTP_CONSUMED', message: 'OTP already consumed.' };
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      return { valid: false, error: 'MAX_ATTEMPTS_EXCEEDED', message: 'Max attempts exceeded.' };
    }

    if (isOtpExpired(otpRecord.expiresAt)) {
      return { valid: false, error: 'OTP_EXPIRED', message: 'OTP expired.' };
    }

    const enteredHash = OrderOtp.hashCode(enteredOtp);
    const isMatch = enteredHash === otpRecord.codeHash;

    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return { valid: false, error: 'OTP_MISMATCH', message: 'Invalid OTP.' };
    }

    // OTP is valid - mark as consumed
    otpRecord.consumedAt = new Date();
    await otpRecord.save();

    return { valid: true, message: 'OTP validated successfully' };
  } catch (error) {
    console.error('Error validating return pickup OTP:', error);
    return { valid: false, error: 'VALIDATION_FAILED', message: 'Internal error.' };
  }
}

/**
 * Generate OTP for return drop-off at seller location.
 * Rider arrives at seller and requests OTP; seller receives it to confirm product receipt.
 * @param {string} orderId
 * @returns {Promise<Object>}
 */
export async function generateReturnDropOtp(orderId) {
  try {
    const order = await Order.findOne({ orderId });
    if (!order) {
      return { success: false, error: 'Order not found' };
    }

    const allowedStatuses = ['return_in_transit', 'return_drop_pending'];
    if (!allowedStatuses.includes(order.returnStatus)) {
      return {
        success: false,
        error: `Return must be in transit before drop-off. Current status: ${order.returnStatus}`,
      };
    }

    const otp = String(crypto.randomInt(0, 10000)).padStart(4, '0');
    const codeHash = OrderOtp.hashCode(otp);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await OrderOtp.updateMany(
      { orderId, type: 'return_drop', consumedAt: null },
      { consumedAt: new Date() }
    );

    await OrderOtp.create({
      orderId,
      orderMongoId: order._id,
      type: 'return_drop',
      codeHash,
      code: otp,
      expiresAt,
      attempts: 0,
      maxAttempts: 3,
      lastGeneratedAt: new Date(),
    });

    return { success: true, otp, expiresAt };
  } catch (error) {
    console.error('Error generating return drop OTP:', error);
    return { success: false, error: 'Failed to generate return drop OTP.' };
  }
}

/**
 * Validate OTP entered by delivery person at seller drop-off.
 * @param {string} orderId
 * @param {string} enteredOtp
 * @returns {Promise<Object>}
 */
export async function validateReturnDropOtp(orderId, enteredOtp) {
  try {
    if (!orderId || !enteredOtp) {
      return { valid: false, error: 'INVALID_FORMAT', message: 'orderId and OTP are required' };
    }

    const otpRecord = await OrderOtp.findOne({ orderId, type: 'return_drop' }).sort({
      lastGeneratedAt: -1,
      createdAt: -1,
    });

    if (!otpRecord) {
      return { valid: false, error: 'OTP_NOT_FOUND', message: 'No seller drop OTP found. Please request a new one.' };
    }

    if (otpRecord.consumedAt) {
      return { valid: false, error: 'OTP_CONSUMED', message: 'OTP already consumed.' };
    }

    if (otpRecord.attempts >= otpRecord.maxAttempts) {
      return { valid: false, error: 'MAX_ATTEMPTS_EXCEEDED', message: 'Max attempts exceeded.' };
    }

    if (isOtpExpired(otpRecord.expiresAt)) {
      return { valid: false, error: 'OTP_EXPIRED', message: 'OTP expired. Please request a new one.' };
    }

    const enteredHash = OrderOtp.hashCode(enteredOtp);
    const isMatch = enteredHash === otpRecord.codeHash;

    if (!isMatch) {
      otpRecord.attempts += 1;
      await otpRecord.save();
      return {
        valid: false,
        error: 'OTP_MISMATCH',
        message: 'Invalid OTP.',
        attemptsRemaining: otpRecord.maxAttempts - otpRecord.attempts,
      };
    }

    otpRecord.consumedAt = new Date();
    await otpRecord.save();

    return { valid: true, message: 'Seller drop OTP validated successfully' };
  } catch (error) {
    console.error('Error validating return drop OTP:', error);
    return { valid: false, error: 'VALIDATION_FAILED', message: 'Internal error.' };
  }
}
