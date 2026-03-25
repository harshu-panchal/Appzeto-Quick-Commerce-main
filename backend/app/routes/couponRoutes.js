import express from "express";
import {
    listCoupons,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    validateCoupon,
} from "../controller/couponController.js";

const router = express.Router();

// Admin management
router.get("/admin/coupons", listCoupons);
router.post("/admin/coupons", createCoupon);
router.put("/admin/coupons/:id", updateCoupon);
router.delete("/admin/coupons/:id", deleteCoupon);

// Customer‑facing
router.post("/coupons/validate", validateCoupon);
router.get("/coupons", listCoupons);

export default router;

