import Product from "../models/product.js";
import StockHistory from "../models/stockHistory.js";
import Transaction from "../models/transaction.js";

/**
 * Reverse stock and fail seller transaction when an order is cancelled
 * after stock was deducted at placement.
 */
export async function compensateOrderCancellation(order, orderIdString) {
  for (const item of order.items) {
    await Product.findByIdAndUpdate(item.product, {
      $inc: { stock: item.quantity },
    });

    await StockHistory.create({
      product: item.product,
      seller: order.seller,
      type: "Correction",
      quantity: item.quantity,
      note: `Order #${orderIdString} Cancelled`,
      order: order._id,
    });
  }

  await Transaction.findOneAndUpdate(
    { reference: orderIdString },
    { status: "Failed" },
  );
}
