import express from "express";
import {
    getCart,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart
} from "../controller/cartController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(verifyToken); // All cart routes require auth

router.get("/", getCart);
router.post("/add", addToCart);
router.put("/update", updateQuantity);
router.delete("/remove/:productId", removeFromCart);
router.delete("/clear", clearCart);

export default router;
