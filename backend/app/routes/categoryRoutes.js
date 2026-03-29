import express from "express";
import {
    getCategories,
    createCategory,
    updateCategory,
    deleteCategory
} from "../controller/categoryController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public route to get categories
router.get("/", getCategories);

// Admin only routes
router.post(
    "/",
    verifyToken,
    allowRoles("admin"),
    createCategory
);

router.put(
    "/:id",
    verifyToken,
    allowRoles("admin"),
    updateCategory
);

router.delete(
    "/:id",
    verifyToken,
    allowRoles("admin"),
    deleteCategory
);

export default router;
