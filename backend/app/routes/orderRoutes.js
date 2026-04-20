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
  updateReturnQcStatus,
  assignReturnDelivery,
  acceptReturnPickup,
  rejectReturnPickup,
  updateReturnStatus,
  uploadReturnPickupProof,
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
  requestReturnPickupOtp,
  verifyReturnPickupOtp,
  requestReturnDropOtp,
  verifyReturnDropOtp,
  getOrderRoute,
} from "../controller/orderWorkflowController.js";
import {
  verifyToken,
  allowRoles,
  requireApprovedSeller,
} from "../middleware/authMiddleware.js";

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
  requireApprovedSeller,
  markOrderDeliveredAndSettle,
);
router.post(
  "/:id/cod/reconcile",
  verifyToken,
  allowRoles("delivery", "admin"),
  reconcileCodCashSubmission,
);

// Customer routes
router.post(
  "/place",
  verifyToken,
  allowRoles("customer", "user", "admin"),
  placeOrder,
);
router.get("/my-orders", verifyToken, getMyOrders);
router.get("/details/:orderId", verifyToken, getOrderDetails);
router.put("/cancel/:orderId", verifyToken, cancelOrder);
router.post("/:orderId/returns", verifyToken, requestReturn);
router.get("/:orderId/returns", verifyToken, getReturnDetails);

// Admin/Seller routes
router.get(
  "/seller-orders",
  verifyToken,
  allowRoles("admin", "seller"),
  requireApprovedSeller,
  getSellerOrders,
);
router.put(
  "/status/:orderId",
  verifyToken,
  allowRoles("admin", "seller"),
  requireApprovedSeller,
  updateOrderStatus,
);
router.get(
  "/seller-returns",
  verifyToken,
  allowRoles("admin", "seller"),
  requireApprovedSeller,
  getSellerReturns,
);
router.put(
  "/returns/:orderId/approve",
  verifyToken,
  allowRoles("admin", "seller"),
  requireApprovedSeller,
  approveReturnRequest,
);
router.put(
  "/returns/:orderId/reject",
  verifyToken,
  allowRoles("admin", "seller"),
  requireApprovedSeller,
  rejectReturnRequest,
);
router.put(
  "/returns/:orderId/qc",
  verifyToken,
  allowRoles("admin"),
  updateReturnQcStatus,
);
router.put(
  "/returns/:orderId/assign-delivery",
  verifyToken,
  allowRoles("admin", "seller"),
  requireApprovedSeller,
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
  "/returns/:orderId/accept-pickup",
  verifyToken,
  allowRoles("admin", "delivery"),
  acceptReturnPickup,
);
router.put(
  "/returns/:orderId/reject-pickup",
  verifyToken,
  allowRoles("admin", "delivery"),
  rejectReturnPickup,
);
router.put(
  "/return-status/:orderId",
  verifyToken,
  allowRoles("admin", "delivery"),
  updateReturnStatus,
);

// Workflow routes — standard delivery
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

// Workflow routes — return pickup OTP (customer)
router.post(
  "/workflow/:orderId/return-otp/request",
  verifyToken,
  allowRoles("delivery", "admin"),
  requestReturnPickupOtp,
);
router.post(
  "/workflow/:orderId/return-otp/verify",
  verifyToken,
  allowRoles("delivery", "admin"),
  verifyReturnPickupOtp,
);

// Workflow routes — return drop OTP (seller)
router.post(
  "/workflow/:orderId/return-drop-otp/request",
  verifyToken,
  allowRoles("delivery", "admin"),
  requestReturnDropOtp,
);
router.post(
  "/workflow/:orderId/return-drop-otp/verify",
  verifyToken,
  allowRoles("delivery", "admin"),
  verifyReturnDropOtp,
);

// Return pickup proof (images + condition)
router.post(
  "/returns/:orderId/pickup-proof",
  verifyToken,
  allowRoles("delivery", "admin"),
  uploadReturnPickupProof,
);

// Route map
router.get(
  "/workflow/:orderId/route",
  verifyToken,
  allowRoles("customer", "user", "delivery", "seller", "admin"),
  requireApprovedSeller,
  getOrderRoute,
);

export default router;
