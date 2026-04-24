import mongoose from "mongoose";
import Order from "../models/order.js";
import Product from "../models/product.js";
import * as logger from "./logger.js";
import { buildCheckoutGroupId } from "./orderIdService.js";
import {
  PRODUCT_APPROVAL_STATUS,
  resolveProductApprovalStatus,
} from "./productModerationService.js";

/**
 * Multi-Seller Checkout Service
 * 
 * Coordinates checkout across multiple sellers with atomic order creation.
 * Handles item grouping, pricing calculation, payment allocation, and
 * stock reservation within MongoDB transactions.
 */

// Configuration
const CHECKOUT_TRANSACTION_TIMEOUT_MS = parseInt(
  process.env.CHECKOUT_TRANSACTION_TIMEOUT_MS || "30000",
  10
);
const MAX_SELLERS_PER_CHECKOUT = parseInt(
  process.env.MAX_SELLERS_PER_CHECKOUT || "10",
  10
);

/**
 * Group cart items by seller
 * @param {Array} items - Cart items with sellerId
 * @returns {Map<string, Array>} Map of sellerId to items
 */
export function groupItemsBySeller(items) {
  const sellerGroups = new Map();
  
  for (const item of items) {
    const sellerId = item.sellerId?.toString() || item.product?.sellerId?.toString();
    
    if (!sellerId) {
      throw new Error(`Item ${item.product?._id || item.productId} has no seller`);
    }
    
    if (!sellerGroups.has(sellerId)) {
      sellerGroups.set(sellerId, []);
    }
    
    sellerGroups.get(sellerId).push(item);
  }
  
  logger.info(`[MultiSellerCheckout] Grouped ${items.length} items into ${sellerGroups.size} seller groups`);
  
  return sellerGroups;
}

/**
 * Generate checkout group ID
 * @returns {string} Unique checkout group identifier
 */
export function generateCheckoutGroupId() {
  return buildCheckoutGroupId();
}

/**
 * Calculate pricing for seller group
 * @param {Array} items - Seller's items
 * @param {Object} params - Pricing parameters
 * @returns {Promise<Object>} Pricing breakdown
 */
export async function calculateSellerPricing(items, params) {
  const { deliveryFeePerSeller = 0, handlingFeePerSeller = 0, taxRate = 0 } = params;
  
  let subtotal = 0;
  
  for (const item of items) {
    const price = item.price || 0;
    const quantity = item.quantity || 1;
    subtotal += price * quantity;
  }
  
  const deliveryFee = deliveryFeePerSeller;
  const handlingFee = handlingFeePerSeller;
  const taxAmount = subtotal * taxRate;
  const total = subtotal + deliveryFee + handlingFee + taxAmount;
  
  return {
    subtotal,
    deliveryFee,
    handlingFee,
    taxAmount,
    total,
  };
}

/**
 * Allocate payment across sellers
 * @param {number} totalAmount - Total payment amount
 * @param {Array} sellerOrders - Seller orders with pricing
 * @returns {Map<string, number>} Map of sellerId to allocated amount
 */
export function allocatePaymentAcrossSellers(totalAmount, sellerOrders) {
  const allocation = new Map();
  
  // Calculate grand total from all seller orders
  let grandTotal = 0;
  for (const order of sellerOrders) {
    grandTotal += order.pricing?.total || 0;
  }
  
  if (grandTotal === 0) {
    throw new Error("Grand total is zero, cannot allocate payment");
  }
  
  // Allocate proportionally
  let allocatedSum = 0;
  
  for (let i = 0; i < sellerOrders.length; i++) {
    const order = sellerOrders[i];
    const sellerId = order.seller.toString();
    const sellerTotal = order.pricing?.total || 0;
    
    // For the last seller, allocate remaining to avoid rounding errors
    if (i === sellerOrders.length - 1) {
      const remaining = totalAmount - allocatedSum;
      allocation.set(sellerId, remaining);
    } else {
      const allocated = (sellerTotal / grandTotal) * totalAmount;
      const rounded = Math.round(allocated * 100) / 100; // Round to 2 decimals
      allocation.set(sellerId, rounded);
      allocatedSum += rounded;
    }
  }
  
  logger.info(`[MultiSellerCheckout] Payment allocated across ${allocation.size} sellers`);
  
  return allocation;
}

/**
 * Create seller orders atomically within a transaction
 * @param {string} checkoutGroupId - Checkout group ID
 * @param {Map} sellerGroups - Seller groups with items and pricing
 * @param {Object} commonData - Common order data (customer, address, payment, etc.)
 * @returns {Promise<Array<Order>>} Created orders
 */
export async function createSellerOrdersAtomic(checkoutGroupId, sellerGroups, commonData) {
  const session = await mongoose.startSession();
  
  try {
    session.startTransaction({
      readConcern: { level: "snapshot" },
      writeConcern: { w: "majority" },
      maxCommitTimeMS: CHECKOUT_TRANSACTION_TIMEOUT_MS,
    });
    
    const orders = [];
    const sellerGroupsArray = Array.from(sellerGroups.entries());
    const checkoutGroupSize = sellerGroupsArray.length;
    
    // Validate seller count
    if (checkoutGroupSize > MAX_SELLERS_PER_CHECKOUT) {
      throw new Error(`Cannot checkout with more than ${MAX_SELLERS_PER_CHECKOUT} sellers`);
    }
    
    logger.info(`[MultiSellerCheckout] Creating ${checkoutGroupSize} seller orders in transaction`);
    
    // Reserve stock for all items first
    for (const [sellerId, group] of sellerGroupsArray) {
      for (const item of group.items) {
        const product = await Product.findById(item.product._id).session(session);
        
        if (!product) {
          throw new Error(`Product ${item.product._id} not found`);
        }

        if (product.status !== "active") {
          throw new Error(`Product ${product.name} is not active`);
        }

        if (resolveProductApprovalStatus(product) !== PRODUCT_APPROVAL_STATUS.APPROVED) {
          throw new Error(`Product ${product.name} is not approved`);
        }
        
        if (product.stock < item.quantity) {
          throw new Error(
            `Insufficient stock for product ${product.name}. Available: ${product.stock}, Requested: ${item.quantity}`
          );
        }
        
        // Decrement stock
        product.stock -= item.quantity;
        await product.save({ session });
      }
    }
    
    // Create orders for each seller
    for (let index = 0; index < sellerGroupsArray.length; index++) {
      const [sellerId, group] = sellerGroupsArray[index];
      
      const orderData = {
        ...commonData,
        seller: sellerId,
        items: group.items,
        pricing: group.pricing,
        paymentBreakdown: group.paymentBreakdown || {},
        checkoutGroupId,
        checkoutGroupSize,
        checkoutGroupIndex: index,
      };
      
      const order = new Order(orderData);
      await order.save({ session });
      orders.push(order);
      
      logger.info(`[MultiSellerCheckout] Created order ${order.orderId} for seller ${sellerId}`);
    }
    
    // Commit transaction
    await session.commitTransaction();
    logger.info(`[MultiSellerCheckout] Transaction committed successfully for group ${checkoutGroupId}`);
    
    return orders;
    
  } catch (error) {
    // Rollback transaction on any error
    await session.abortTransaction();
    logger.error(`[MultiSellerCheckout] Transaction aborted for group ${checkoutGroupId}:`, error);
    throw error;
    
  } finally {
    session.endSession();
  }
}

/**
 * Process multi-seller checkout
 * @param {Object} params - Checkout parameters
 * @returns {Promise<Object>} Checkout result with orders
 */
export async function processMultiSellerCheckout(params) {
  const {
    customerId,
    items,
    address,
    payment,
    pricing,
    timeSlot,
    idempotencyKey,
  } = params;
  
  try {
    logger.info(`[MultiSellerCheckout] Processing checkout for customer ${customerId}`);
    
    // Populate product details for items
    const populatedItems = await Promise.all(
      items.map(async (item) => {
        const product = await Product.findById(item.productId || item.product);
        if (!product) {
          throw new Error(`Product ${item.productId || item.product} not found`);
        }
        if (product.status !== "active") {
          throw new Error(`Product ${product.name} is not active`);
        }
        if (resolveProductApprovalStatus(product) !== PRODUCT_APPROVAL_STATUS.APPROVED) {
          throw new Error(`Product ${product.name} is not approved`);
        }
        return {
          product: {
            _id: product._id,
            sellerId: product.sellerId,
          },
          name: product.name,
          quantity: item.quantity,
          price: product.salePrice || product.price,
          variantSlot: item.variantSlot,
          image: product.mainImage,
        };
      })
    );
    
    // Group items by seller
    const sellerGroups = groupItemsBySeller(populatedItems);
    
    // Check if multi-seller checkout
    const isMultiSeller = sellerGroups.size > 1;
    
    if (!isMultiSeller) {
      // Single seller - no need for checkout group
      logger.info(`[MultiSellerCheckout] Single seller checkout, skipping group creation`);
      return null; // Let existing single-seller flow handle this
    }
    
    // Generate checkout group ID
    const checkoutGroupId = generateCheckoutGroupId();
    
    // Calculate pricing for each seller group
    const sellerGroupsWithPricing = new Map();
    
    for (const [sellerId, items] of sellerGroups) {
      const sellerPricing = await calculateSellerPricing(items, {
        deliveryFeePerSeller: pricing?.deliveryFee / sellerGroups.size || 0,
        handlingFeePerSeller: pricing?.platformFee / sellerGroups.size || 0,
        taxRate: 0, // Tax calculation can be added here
      });
      
      sellerGroupsWithPricing.set(sellerId, {
        items,
        pricing: {
          subtotal: sellerPricing.subtotal,
          deliveryFee: sellerPricing.deliveryFee,
          platformFee: sellerPricing.handlingFee,
          gst: sellerPricing.taxAmount,
          total: sellerPricing.total,
        },
      });
    }
    
    // Prepare common order data
    const commonData = {
      customer: customerId,
      address,
      payment: {
        method: payment?.method || "cash",
        status: "pending",
      },
      timeSlot: timeSlot || "now",
      status: "pending",
      orderStatus: "pending",
      workflowVersion: 2,
      workflowStatus: "SELLER_PENDING",
      placement: {
        idempotencyKey,
        createdFrom: "CART",
      },
    };
    
    // Create orders atomically
    const orders = await createSellerOrdersAtomic(
      checkoutGroupId,
      sellerGroupsWithPricing,
      commonData
    );
    
    // Allocate payment across sellers
    const paymentAllocation = allocatePaymentAcrossSellers(
      pricing?.total || 0,
      orders
    );
    
    logger.info(`[MultiSellerCheckout] Checkout completed successfully for group ${checkoutGroupId}`);
    
    return {
      checkoutGroupId,
      orders,
      paymentAllocation,
      sellerCount: sellerGroups.size,
    };
    
  } catch (error) {
    logger.error(`[MultiSellerCheckout] Checkout failed:`, error);
    throw error;
  }
}

export default {
  groupItemsBySeller,
  generateCheckoutGroupId,
  calculateSellerPricing,
  allocatePaymentAcrossSellers,
  createSellerOrdersAtomic,
  processMultiSellerCheckout,
};
