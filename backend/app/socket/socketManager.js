/**
 * Socket.IO — order rooms, role rooms, JWT auth.
 */
import { verifySocketToken } from "./socketAuth.js";

let _io = null;

const deliverySockets = new Map();

export const initSocket = (io) => {
  _io = io;

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.query?.token ||
      null;
    if (!token) {
      socket.user = null;
      return next();
    }
    const user = verifySocketToken(token);
    if (!user) {
      return next(new Error("Unauthorized"));
    }
    socket.user = user;
    next();
  });

  io.on("connection", (socket) => {
    const { id: userId, role } = socket.user || {};
    if (!userId) {
      console.log('[SocketManager] Connection without userId, rejecting');
      return;
    }

    console.log(`[SocketManager] New connection: userId=${userId}, role=${role}, socketId=${socket.id}`);

    if (role === "delivery") {
      const dId = userId.toString();
      deliverySockets.set(dId, socket.id);
      socket.join("delivery:online");
      socket.join(`delivery:${dId}`);
      console.log(`[SocketManager] Delivery partner joined rooms: delivery:online, delivery:${dId}`);
    }
    if (role === "seller") {
      socket.join(`seller:${userId}`);
      console.log(`[SocketManager] Seller joined room: seller:${userId}`);
    }
    if (role === "customer" || role === "user") {
      socket.join(`customer:${userId}`);
      console.log(`[SocketManager] Customer joined room: customer:${userId}`);
    }
    if (role === "admin") {
      socket.join("admin:orders");
      console.log(`[SocketManager] Admin joined room: admin:orders`);
    }

    socket.on("join_order", (orderId) => {
      if (!orderId || typeof orderId !== "string") return;
      socket.join(`order:${orderId}`);
      console.log(`[SocketManager] Socket ${socket.id} joined order room: order:${orderId}`);
    });

    socket.on("leave_order", (orderId) => {
      if (!orderId) return;
      socket.leave(`order:${orderId}`);
      console.log(`[SocketManager] Socket ${socket.id} left order room: order:${orderId}`);
    });

    socket.on("register_delivery", (deliveryId) => {
      if (deliveryId && socket.user?.role === "delivery") {
        deliverySockets.set(deliveryId.toString(), socket.id);
        console.log(`[SocketManager] Delivery ${deliveryId} registered with socket ${socket.id}`);
      }
    });

    socket.on("disconnect", () => {
      console.log(`[SocketManager] Socket ${socket.id} disconnected (userId=${userId}, role=${role})`);
      for (const [id, sid] of deliverySockets.entries()) {
        if (sid === socket.id) {
          deliverySockets.delete(id);
          console.log(`[SocketManager] Removed delivery ${id} from active sockets`);
          break;
        }
      }
    });
  });
};

export const getIO = () => {
  if (!_io) throw new Error("Socket.IO not initialized");
  return _io;
};

export const notifyDeliveryPartners = (orderData) => {
  if (!_io) return;
  _io.to("delivery:online").emit("new_order_packed", orderData);
};
