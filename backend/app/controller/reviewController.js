import Review from "../models/review.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";

// Submit a review (Customer)
export const submitReview = async (req, res) => {
    try {
        const { productId, rating, comment } = req.body;
        const userId = req.user.id;

        // Check if user already reviewed this product
        const existingReview = await Review.findOne({ userId, productId });
        if (existingReview) {
            return handleResponse(res, 400, "You have already reviewed this product");
        }

        const newReview = new Review({
            userId,
            productId,
            rating,
            comment,
            status: "pending", // Always pending until admin approves
        });

        await newReview.save();
        return handleResponse(res, 201, "Review submitted and pending approval", newReview);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Get approved reviews for a product (Public)
export const getProductReviews = async (req, res) => {
    try {
        const { productId } = req.params;
        const reviews = await Review.find({ productId, status: "approved" })
            .populate("userId", "name image")
            .sort({ createdAt: -1 });

        return handleResponse(res, 200, "Reviews fetched successfully", reviews);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Get all pending reviews
export const getPendingReviews = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });

        const query = { status: "pending" };

        const [reviews, total] = await Promise.all([
            Review.find(query)
                .populate("userId", "name email")
                .populate("productId", "name images")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Review.countDocuments(query)
        ]);

        return handleResponse(res, 200, "Pending reviews fetched successfully", {
            items: reviews,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Update review status (Approve/Reject)
export const updateReviewStatus = async (req, res) => {
    try {
        const { status } = req.body; // approved or rejected
        const { id } = req.params;

        const review = await Review.findByIdAndUpdate(id, { status }, { new: true });
        if (!review) return handleResponse(res, 404, "Review not found");

        return handleResponse(res, 200, `Review ${status} successfully`, review);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
