import express from "express";
import {
  placeOrder,
  getMyOrders,
  getOrderDetails,
  cancelOrder,
  updateOrderStatus,
  getSellerOrders,
  getAvailableOrders,
  acceptOrder,
  skipOrder,
  requestReturn,
  getReturnDetails,
  getSellerReturns,
  approveReturnRequest,
  rejectReturnRequest,
  assignReturnDelivery,
  updateReturnStatus,
} from "../controller/orderController.js";
import {
  createOrderWithFinancialSnapshot,
  markCodCollectedAfterDelivery,
  markOrderDeliveredAndSettle,
  previewCheckoutFinance,
  reconcileCodCashSubmission,
  verifyOnlineOrderPayment,
} from "../controller/orderFinanceController.js";
import {
  confirmPickup,
  markArrivedAtStore,
  advanceDeliveryRiderUi,
  requestDeliveryOtp,
  verifyDeliveryOtp,
  getOrderRoute,
} from "../controller/orderWorkflowController.js";
// Assuming there's a middleware to verify customer token
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Finance-aware checkout/order flow
router.post(
  "/checkout/preview",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  previewCheckoutFinance,
);
router.post(
  "/",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  createOrderWithFinancialSnapshot,
);
router.post(
  "/:id/payment/verify-online",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  verifyOnlineOrderPayment,
);
router.post(
  "/:id/cod/mark-collected",
  verifyToken,
  allowRoles("delivery", "admin"),
  markCodCollectedAfterDelivery,
);
router.post(
  "/:id/delivered",
  verifyToken,
  allowRoles("delivery", "admin", "seller"),
  markOrderDeliveredAndSettle,
);
router.post(
  "/:id/cod/reconcile",
  verifyToken,
  allowRoles("delivery", "admin"),
  reconcileCodCashSubmission,
);

// Customer routes
router.post("/place", verifyToken, placeOrder);
router.get("/my-orders", verifyToken, getMyOrders);
router.get("/details/:orderId", verifyToken, getOrderDetails);
router.put("/cancel/:orderId", verifyToken, cancelOrder);
router.post("/:orderId/returns", verifyToken, requestReturn);
router.get("/:orderId/returns", verifyToken, getReturnDetails);

// Admin/Seller routes (might need different auth middleware for role checks)
router.get(
  "/seller-orders",
  verifyToken,
  allowRoles("admin", "seller"),
  getSellerOrders,
);
router.put("/status/:orderId", verifyToken, updateOrderStatus);
router.get(
  "/seller-returns",
  verifyToken,
  allowRoles("admin", "seller"),
  getSellerReturns,
);
router.put(
  "/returns/:orderId/approve",
  verifyToken,
  allowRoles("admin", "seller"),
  approveReturnRequest,
);
router.put(
  "/returns/:orderId/reject",
  verifyToken,
  allowRoles("admin", "seller"),
  rejectReturnRequest,
);
router.put(
  "/returns/:orderId/assign-delivery",
  verifyToken,
  allowRoles("admin", "seller"),
  assignReturnDelivery,
);

// Delivery routes
router.get(
  "/available",
  verifyToken,
  allowRoles("admin", "delivery"),
  getAvailableOrders,
);
router.put(
  "/accept/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  acceptOrder,
);
router.put(
  "/skip/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  skipOrder,
);
router.put(
  "/return-status/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  updateReturnStatus,
);

router.post(
  "/workflow/:orderId/pickup/confirm",
  verifyToken,
  allowRoles("delivery", "admin"),
  confirmPickup,
);
router.post(
  "/workflow/:orderId/pickup/ready",
  verifyToken,
  allowRoles("delivery", "admin"),
  markArrivedAtStore,
);
router.post(
  "/workflow/:orderId/rider/advance-ui",
  verifyToken,
  allowRoles("delivery", "admin"),
  advanceDeliveryRiderUi,
);
router.post(
  "/workflow/:orderId/otp/request",
  verifyToken,
  allowRoles("delivery", "admin"),
  requestDeliveryOtp,
);
router.post(
  "/workflow/:orderId/otp/verify",
  verifyToken,
  allowRoles("delivery", "admin"),
  verifyDeliveryOtp,
);
router.get(
  "/workflow/:orderId/route",
  verifyToken,
  allowRoles("customer", "user", "delivery", "seller", "admin"),
  getOrderRoute,
);

export default router;
