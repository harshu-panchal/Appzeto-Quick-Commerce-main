import Notification from "../models/notification.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";

/* ===============================
   GET MY NOTIFICATIONS
================================ */
export const getMyNotifications = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req, {
            defaultLimit: 20,
            maxLimit: 100,
        });

        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find({ recipient: req.user.id })
                .sort({ createdAt: -1, _id: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            Notification.countDocuments({ recipient: req.user.id }),
            Notification.countDocuments({
                recipient: req.user.id,
                isRead: false,
            }),
        ]);

        return handleResponse(res, 200, "Notifications fetched successfully", {
            notifications,
            items: notifications,
            unreadCount,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   MARK NOTIFICATION AS READ
================================ */
export const markAsRead = async (req, res) => {
    try {
        const { id } = req.params;
        const notification = await Notification.findOneAndUpdate(
            { _id: id, recipient: req.user.id },
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return handleResponse(res, 404, "Notification not found");
        }

        return handleResponse(res, 200, "Notification marked as read", notification);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

/* ===============================
   MARK ALL AS READ
================================ */
export const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user.id, isRead: false },
            { isRead: true }
        );

        return handleResponse(res, 200, "All notifications marked as read");
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
