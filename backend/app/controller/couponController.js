import Coupon from "../models/coupon.js";
import handleResponse from "../utils/helper.js";
import Order from "../models/order.js";

export const listCoupons = async (req, res) => {
    try {
        const { status, search } = req.query;
        const query = {};

        if (status === "active") {
            const now = new Date();
            query.isActive = true;
            query.validFrom = { $lte: now };
            query.validTill = { $gte: now };
        } else if (status === "expired") {
            query.$or = [{ isActive: false }, { validTill: { $lt: new Date() } }];
        }

        if (search) {
            const term = search.trim();
            query.$or = [
                { code: { $regex: term, $options: "i" } },
                { title: { $regex: term, $options: "i" } },
                { description: { $regex: term, $options: "i" } },
            ];
        }

        const coupons = await Coupon.find(query).sort({ createdAt: -1 }).lean();
        return handleResponse(res, 200, "Coupons fetched successfully", coupons);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const createCoupon = async (req, res) => {
    try {
        const data = { ...req.body };
        const coupon = await Coupon.create(data);
        return handleResponse(res, 201, "Coupon created successfully", coupon);
    } catch (error) {
        if (error.code === 11000) {
            return handleResponse(res, 400, "Coupon code already exists");
        }
        return handleResponse(res, 500, error.message);
    }
};

export const updateCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        const data = { ...req.body };
        const coupon = await Coupon.findByIdAndUpdate(id, data, {
            new: true,
            runValidators: true,
        });
        if (!coupon) {
            return handleResponse(res, 404, "Coupon not found");
        }
        return handleResponse(res, 200, "Coupon updated successfully", coupon);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

export const deleteCoupon = async (req, res) => {
    try {
        const { id } = req.params;
        await Coupon.findByIdAndDelete(id);
        return handleResponse(res, 200, "Coupon deleted successfully");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Simple validation engine for checkout
export const validateCoupon = async (req, res) => {
    try {
        const { code, cartTotal, items, customerId } = req.body;

        if (!code) {
            return handleResponse(res, 400, "Coupon code is required");
        }

        const now = new Date();
        const coupon = await Coupon.findOne({ code: code.toUpperCase() });
        if (!coupon) {
            return handleResponse(res, 404, "Invalid coupon code");
        }

        if (!coupon.isActive || coupon.validFrom > now || coupon.validTill < now) {
            return handleResponse(res, 400, "This coupon is not active");
        }

        // Usage limits (overall)
        if (coupon.usageLimit && coupon.usedCount >= coupon.usageLimit) {
            return handleResponse(res, 400, "This coupon has reached its usage limit");
        }

        // Per-user limit & monthly volume – basic implementation
        let userUsageCount = 0;
        let monthlyVolume = 0;
        if (customerId) {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const userOrders = await Order.find({
                customer: customerId,
                createdAt: { $gte: monthStart, $lte: now },
            }).lean();

            monthlyVolume = userOrders.reduce(
                (sum, o) => sum + (o.pricing?.total || 0),
                0
            );

            // We are not storing coupon reference on order yet, so this is a soft check.
            // Once couponId gets stored on orders, we can count exact usages.
            userUsageCount = 0;
        }

        if (coupon.perUserLimit && userUsageCount >= coupon.perUserLimit) {
            return handleResponse(res, 400, "You have already used this coupon");
        }

        if (
            coupon.couponType === "monthly_volume" &&
            coupon.monthlyVolumeThreshold &&
            monthlyVolume < coupon.monthlyVolumeThreshold
        ) {
            return handleResponse(
                res,
                400,
                "This coupon is for high‑volume buyers only"
            );
        }

        // Base conditions
        if (coupon.minOrderValue && cartTotal < coupon.minOrderValue) {
            return handleResponse(
                res,
                400,
                `Minimum order value should be ₹${coupon.minOrderValue}`
            );
        }

        if (coupon.minItems && Array.isArray(items) && items.length < coupon.minItems) {
            return handleResponse(
                res,
                400,
                `Add at least ${coupon.minItems} items to use this coupon`
            );
        }

        // Category based condition
        if (
            coupon.couponType === "category_based" &&
            Array.isArray(coupon.applicableCategories) &&
            coupon.applicableCategories.length > 0
        ) {
            const hasEligibleItem =
                Array.isArray(items) &&
                items.some((i) =>
                    coupon.applicableCategories.some(
                        (cId) =>
                            String(i.categoryId) === String(cId) ||
                            String(i.category?._id) === String(cId)
                    )
                );
            if (!hasEligibleItem) {
                return handleResponse(
                    res,
                    400,
                    "This coupon is valid only on selected categories"
                );
            }
        }

        // Calculate discount
        let discountAmount = 0;
        let freeDelivery = false;

        if (coupon.discountType === "free_delivery") {
            freeDelivery = true;
        } else if (coupon.discountType === "percentage") {
            discountAmount = Math.round((cartTotal * coupon.discountValue) / 100);
        } else if (coupon.discountType === "fixed") {
            discountAmount = coupon.discountValue;
        }

        if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) {
            discountAmount = coupon.maxDiscount;
        }

        if (discountAmount <= 0 && !freeDelivery) {
            return handleResponse(
                res,
                400,
                "This coupon does not provide any discount on current cart"
            );
        }

        return handleResponse(res, 200, "Coupon applied", {
            couponId: coupon._id,
            code: coupon.code,
            discountAmount,
            freeDelivery,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

