import Ticket from "../models/ticket.js";
import Admin from "../models/admin.js";
import handleResponse from "../utils/helper.js";
import getPagination from "../utils/pagination.js";
import { emitTicketCreated, emitTicketMessage } from "../services/ticketSocketEmitter.js";
import { emitNotificationEvent } from "../modules/notifications/notification.emitter.js";
import { NOTIFICATION_EVENTS } from "../modules/notifications/notification.constants.js";

async function getAdminIds() {
    const admins = await Admin.find().select("_id").lean();
    return (admins || []).map((a) => a?._id).filter(Boolean);
}

// Create a new ticket (Customer/Seller/Rider)
export const createTicket = async (req, res) => {
    try {
        const { subject, description, priority, userType, mediaUrl, mediaType, mimeType } = req.body;
        const userId = req.user.id; // From verifyToken middleware

        const safeMediaUrl = String(mediaUrl || "").trim();
        const safeMediaType = String(mediaType || "").trim();
        const safeMimeType = String(mimeType || "").trim();

        const newTicket = new Ticket({
            userId,
            userType: userType || "Customer",
            subject,
            description,
            priority,
            messages: [
                {
                    sender: req.user.name || "User",
                    senderId: userId,
                    senderType: "User",
                    text: description,
                    mediaUrl: safeMediaUrl,
                    mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
                    mimeType: safeMediaUrl ? safeMimeType : "",
                    isAdmin: false,
                },
            ],
        });

        await newTicket.save();
        emitTicketCreated(newTicket);

        try {
            const savedMessage = newTicket.messages?.[newTicket.messages.length - 1];
            const adminIds = await getAdminIds();
            emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, {
                fromRole: "customer",
                ticketId: newTicket._id,
                messageId: savedMessage?._id,
                messageCreatedAt: savedMessage?.createdAt,
                userId,
                userName: req.user.name || "User",
                adminIds,
                messageText: description || (safeMediaUrl ? "Sent an image" : ""),
                data: {
                    subject,
                },
            });
        } catch {
            // Push notifications are best-effort; never block ticket creation.
        }

        return handleResponse(res, 201, "Ticket created successfully", newTicket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Get all tickets for current user
export const getMyTickets = async (req, res) => {
    try {
        const tickets = await Ticket.find({ userId: req.user.id }).sort({ createdAt: -1 });
        return handleResponse(res, 200, "Tickets fetched successfully", tickets);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Get all tickets
export const getAllTickets = async (req, res) => {
    try {
        const { page, limit, skip } = getPagination(req, { defaultLimit: 25, maxLimit: 200 });

        const [tickets, total] = await Promise.all([
            Ticket.find().populate("userId", "name email").sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Ticket.countDocuments()
        ]);

        return handleResponse(res, 200, "All tickets fetched successfully", {
            items: tickets,
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit) || 1,
        });
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin/User: Reply to a ticket
export const replyToTicket = async (req, res) => {
    try {
        const { text, isAdmin, mediaUrl, mediaType, mimeType } = req.body;
        const { id } = req.params;

        const ticket = await Ticket.findById(id);
        if (!ticket) return handleResponse(res, 404, "Ticket not found");

        const safeText = String(text || "").trim();
        const safeMediaUrl = String(mediaUrl || "").trim();
        const safeMediaType = String(mediaType || "").trim();
        const safeMimeType = String(mimeType || "").trim();

        if (!safeText && !safeMediaUrl) {
            return handleResponse(res, 400, "Message text or mediaUrl is required");
        }

        const newMessage = {
            sender: isAdmin ? "Admin" : (req.user.name || "User"),
            senderId: req.user.id,
            senderType: isAdmin ? "Admin" : "User",
            text: safeText,
            mediaUrl: safeMediaUrl,
            mediaType: safeMediaUrl ? (safeMediaType || "image") : "",
            mimeType: safeMediaUrl ? safeMimeType : "",
            isAdmin: !!isAdmin,
        };

        ticket.messages.push(newMessage);
        if (isAdmin) {
            ticket.status = "processing";
        }

        await ticket.save();

        const savedMessage = ticket.messages[ticket.messages.length - 1];
        emitTicketMessage({
            ticketId: ticket._id,
            userId: ticket.userId,
            message: typeof savedMessage?.toObject === "function" ? savedMessage.toObject() : savedMessage,
        });

        try {
            const fromRole = isAdmin ? "admin" : "customer";
            const payload = {
                fromRole,
                ticketId: ticket._id,
                messageId: savedMessage?._id,
                messageCreatedAt: savedMessage?.createdAt,
                userId: ticket.userId,
                userName: req.user.name || "User",
                messageText: safeText || (safeMediaUrl ? "Sent an image" : ""),
                data: {
                    subject: ticket.subject,
                },
            };

            if (!isAdmin) {
                payload.adminIds = await getAdminIds();
            }

            emitNotificationEvent(NOTIFICATION_EVENTS.SUPPORT_TICKET_MESSAGE, payload);
        } catch {
            // Best-effort; chat must work even if push is misconfigured.
        }

        return handleResponse(res, 200, "Reply sent successfully", ticket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};

// Admin: Update status
export const updateTicketStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const { id } = req.params;

        const ticket = await Ticket.findByIdAndUpdate(id, { status }, { new: true });
        if (!ticket) return handleResponse(res, 404, "Ticket not found");

        return handleResponse(res, 200, `Ticket status updated to ${status}`, ticket);
    } catch (error) {
        return handleResponse(res, 500, error.message);
    }
};
