import express from "express";
import {
    getProducts,
    getSellerProducts,
    createProduct,
    updateProduct,
    deleteProduct,
    getProductById
} from "../controller/productController.js";
import { adjustStock, getStockHistory } from "../controller/stockController.js";
import {
    verifyToken,
    allowRoles,
    optionalVerifyToken,
    requireApprovedSeller,
} from "../middleware/authMiddleware.js";
import multer from "multer";

const storage = multer.memoryStorage();
const upload = multer({ storage });

const router = express.Router();

// Public routes with optional auth (to detect admin/seller vs customer)
router.get("/", optionalVerifyToken, getProducts);

// Seller protected routes
router.get("/seller/me", verifyToken, allowRoles("seller"), requireApprovedSeller, getSellerProducts);
router.get("/stock-history", verifyToken, allowRoles("seller"), requireApprovedSeller, getStockHistory);
router.post("/adjust-stock", verifyToken, allowRoles("seller"), requireApprovedSeller, adjustStock);
router.get("/:id", optionalVerifyToken, getProductById);

router.post(
    "/",
    verifyToken,
    allowRoles("seller"),
    requireApprovedSeller,
    upload.any(),
    createProduct
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    upload.any(),
    updateProduct
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    requireApprovedSeller,
    deleteProduct
);

export default router;
