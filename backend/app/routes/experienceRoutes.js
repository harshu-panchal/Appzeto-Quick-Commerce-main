import express from "express";
import multer from "multer";
import {
  getAdminExperienceSections,
  createExperienceSection,
  updateExperienceSection,
  deleteExperienceSection,
  reorderExperienceSections,
  getPublicExperienceSections,
  uploadBannerImage,
  getPublicHeroConfig,
  getAdminHeroConfig,
  upsertHeroConfig,
} from "../controller/experienceController.js";
import { verifyToken, allowRoles } from "../middleware/authMiddleware.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Admin routes (protected)
router.get(
  "/admin/experience",
  verifyToken,
  allowRoles("admin"),
  getAdminExperienceSections
);

router.post(
  "/admin/experience",
  verifyToken,
  allowRoles("admin"),
  createExperienceSection
);

// Specific routes MUST come before generic parameterized route /admin/experience/:id
router.put(
  "/admin/experience/reorder",
  verifyToken,
  allowRoles("admin"),
  reorderExperienceSections
);

// Admin hero config (separate from experience sections) - before :id so "hero" is not matched as id
router.get(
  "/admin/experience/hero",
  verifyToken,
  allowRoles("admin"),
  getAdminHeroConfig
);
router.put(
  "/admin/experience/hero",
  verifyToken,
  allowRoles("admin"),
  upsertHeroConfig
);

router.put(
  "/admin/experience/:id",
  verifyToken,
  allowRoles("admin"),
  updateExperienceSection
);

router.delete(
  "/admin/experience/:id",
  verifyToken,
  allowRoles("admin"),
  deleteExperienceSection
);

router.post(
  "/admin/experience/upload-banner",
  verifyToken,
  allowRoles("admin"),
  upload.single("image"),
  uploadBannerImage
);

// Public routes
router.get("/experience", getPublicExperienceSections);
router.get("/experience/hero", getPublicHeroConfig);

export default router;
