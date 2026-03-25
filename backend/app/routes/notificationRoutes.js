import express from "express";
import {
    getMyNotifications,
    markAsRead,
    markAllAsRead
} from "../controller/notificationController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = express.Router();

// All routes are protected
router.use(verifyToken);

router.get("/", getMyNotifications);
router.put("/mark-all-read", markAllAsRead);
router.put("/:id/read", markAsRead);

export default router;
