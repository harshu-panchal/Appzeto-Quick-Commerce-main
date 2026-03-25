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
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";
import upload from "../middleware/uploadMiddleware.js";

const router = express.Router();

// Public routes
router.get("/", getProducts);
router.get("/:id", getProductById);

// Seller protected routes
router.get("/seller/me", verifyToken, allowRoles("seller"), getSellerProducts);

router.post(
    "/",
    verifyToken,
    allowRoles("seller"),
    upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 5 }
    ]),
    createProduct
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    upload.fields([
        { name: 'mainImage', maxCount: 1 },
        { name: 'galleryImages', maxCount: 5 },
        { name: 'images', maxCount: 5 } // For admin compatibility
    ]),
    updateProduct
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("seller", "admin"),
    deleteProduct
);

// Stock Management
router.post("/adjust-stock", verifyToken, allowRoles("seller"), adjustStock);
router.get("/stock-history", verifyToken, allowRoles("seller"), getStockHistory);

export default router;
