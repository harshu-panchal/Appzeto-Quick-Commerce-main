import express from "express";
import multer from "multer";
import { getPublicSettings, updateSettings, uploadSettingsImage } from "../controller/settingsController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Public: anyone can read settings (frontend, admin pre-fill)
router.get("/", getPublicSettings);

// Admin only: update settings
router.put("/", verifyToken, allowRoles("admin"), updateSettings);

// Admin only: upload logo or favicon (multipart/form-data, field "image")
router.post("/upload", verifyToken, allowRoles("admin"), upload.single("image"), uploadSettingsImage);

export default router;
