import Joi from "joi";

const objectIdOrPublicOrderSchema = Joi.string().trim().min(8).max(64).required();

export const createPaymentOrderSchema = Joi.object({
  orderRef: objectIdOrPublicOrderSchema.optional(),
  orderId: objectIdOrPublicOrderSchema.optional(),
}).or("orderRef", "orderId");

export const verifyPaymentClientSchema = Joi.object({
  orderRef: objectIdOrPublicOrderSchema.optional(),
  orderId: objectIdOrPublicOrderSchema.optional(),
  razorpay_order_id: Joi.string().trim().required(),
  razorpay_payment_id: Joi.string().trim().required(),
  razorpay_signature: Joi.string().trim().required(),
}).or("orderRef", "orderId");

export function validateSchema(schema, payload) {
  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    stripUnknown: true,
  });

  if (error) {
    const err = new Error(error.details.map((item) => item.message).join("; "));
    err.statusCode = 400;
    throw err;
  }
  return value;
}
