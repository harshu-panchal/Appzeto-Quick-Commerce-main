import customerRoute from "./customerAuth.js";
import deliveryRoute from "./deliveryAuth.js";
import adminRoute from "./adminAuth.js";
import sellerRoute from "./sellerAuth.js";
import categoryRoute from "./categoryRoutes.js";
import productRoute from "./productRoutes.js";
import cartRoute from "./cartRoutes.js";
import wishlistRoute from "./wishlistRoutes.js";
import orderRoute from "./orderRoutes.js";
import paymentRoute from "./paymentRoutes.js";
import notificationRoute from "./notificationRoutes.js";
import pushRoute from "./pushRoutes.js";
import ticketRoute from "./ticketRoutes.js";
import reviewRoute from "./reviewRoutes.js";
import faqRoute from "./faqRoutes.js";
import experienceRoute from "./experienceRoutes.js";
import offerRoute from "./offerRoutes.js";
import couponRoute from "./couponRoutes.js";
import settingsRoute from "./settingsRoutes.js";
import mapsRoute from "./mapsRoutes.js";
import mediaRoute from "./mediaRoutes.js";
import healthRoute from "./healthRoutes.js";
import metricsRoute from "./metricsRoutes.js";
import authOtpRoute from "../modules/otp/otp.routes.js";

import express from "express";

const setupRoutes = (app) => {
    const router = express.Router();

    // Health and metrics endpoints (no /api prefix for standard paths)
    app.use("/health", healthRoute);
    app.use("/metrics", metricsRoute);

    router.use("/customer", customerRoute);
    router.use("/delivery", deliveryRoute);
    router.use("/admin/categories", categoryRoute);
    router.use("/admin", adminRoute);
    router.use("/seller", sellerRoute);
    router.use("/settings", settingsRoute);
    router.use("/categories", categoryRoute);
    router.use("/products", productRoute);
    router.use("/cart", cartRoute);
    router.use("/wishlist", wishlistRoute);
    router.use("/orders", orderRoute);
    router.use("/payments", paymentRoute);
    router.use("/maps", mapsRoute);
    router.use("/media", mediaRoute);
    router.use("/", experienceRoute);
    router.use("/", offerRoute);
    router.use("/", couponRoute);
    router.use("/notifications", notificationRoute);
    router.use("/auth/otp", authOtpRoute);
    router.use("/push", pushRoute);
    router.use("/tickets", ticketRoute);
    router.use("/reviews", reviewRoute);
    router.use("/admin/faqs", faqRoute);
    router.use("/public/faqs", faqRoute); // For public access without admin prefix

    app.use("/api", router);
}
export default setupRoutes;
