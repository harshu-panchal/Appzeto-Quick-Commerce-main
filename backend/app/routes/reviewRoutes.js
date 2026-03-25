import express from "express";
import {
    submitReview,
    getProductReviews,
    getPendingReviews,
    updateReviewStatus
} from "../controller/reviewController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public routes
router.get("/product/:productId", getProductReviews);

// Authenticated User routes
router.post("/submit", verifyToken, submitReview);

// Admin only routes
router.get("/admin/pending", verifyToken, allowRoles("admin"), getPendingReviews);
router.patch("/admin/status/:id", verifyToken, allowRoles("admin"), updateReviewStatus);

export default router;
