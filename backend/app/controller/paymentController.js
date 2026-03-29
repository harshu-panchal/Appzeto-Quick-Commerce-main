import handleResponse from "../utils/helper.js";
import {
  createPaymentOrderSchema,
  validateSchema,
  verifyPaymentClientSchema,
} from "../validation/paymentValidation.js";
import {
  createPaymentOrderForOrderRef,
  processRazorpayWebhook,
  verifyClientPaymentCallback,
} from "../services/paymentService.js";

function getCorrelationId(req) {
  return String(
    req.correlationId ||
      req.headers["x-correlation-id"] ||
      req.headers["x-request-id"] ||
      "",
  ).trim() || null;
}

export const createRazorpayOrder = async (req, res) => {
  try {
    const payload = validateSchema(createPaymentOrderSchema, req.body || {});
    const idempotencyKey = String(req.headers["idempotency-key"] || "").trim() || null;

    const { payment, gatewayOrder, duplicate } = await createPaymentOrderForOrderRef({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      idempotencyKey,
      correlationId: getCorrelationId(req),
    });

    return handleResponse(
      res,
      duplicate ? 200 : 201,
      duplicate ? "Existing payment attempt returned" : "Payment order created",
      {
        paymentId: payment._id,
        publicOrderId: payment.publicOrderId,
        gatewayOrderId: gatewayOrder.id,
        gatewayName: payment.gatewayName,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        attemptCount: payment.attemptCount,
      },
    );
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const payload = validateSchema(verifyPaymentClientSchema, req.body || {});
    const verification = await verifyClientPaymentCallback({
      orderRef: payload.orderRef || payload.orderId,
      userId: req.user?.id,
      gatewayOrderId: payload.razorpay_order_id,
      gatewayPaymentId: payload.razorpay_payment_id,
      gatewaySignature: payload.razorpay_signature,
      correlationId: getCorrelationId(req),
    });

    return handleResponse(res, 200, "Payment verification processed", {
      signatureIsValid: verification.signatureIsValid,
      paymentStatus: verification.status,
      publicOrderId: verification.payment.publicOrderId,
      gatewayOrderId: verification.payment.gatewayOrderId,
      gatewayPaymentId: verification.payment.gatewayPaymentId,
    });
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};

export const handleRazorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    const eventId = String(req.headers["x-razorpay-event-id"] || "").trim() || null;
    const rawBody = req.body;

    if (!Buffer.isBuffer(rawBody)) {
      return handleResponse(res, 400, "Invalid webhook payload");
    }

    const result = await processRazorpayWebhook({
      rawBody,
      signature,
      eventId,
      correlationId: getCorrelationId(req),
    });

    return handleResponse(res, 200, "Webhook processed", result);
  } catch (error) {
    return handleResponse(res, error.statusCode || 500, error.message);
  }
};
