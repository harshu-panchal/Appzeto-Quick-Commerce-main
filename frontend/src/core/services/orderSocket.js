import { io } from "socket.io-client";
import { resolveSocketBaseUrl } from "@core/api/resolveApiBaseUrl";

let socket = null;
let socketUrl = "";

function socketBaseUrl() {
  return resolveSocketBaseUrl();
}

/**
 * Singleton Socket.IO client with JWT auth.
 */
export function getOrderSocket(getToken) {
  const token = typeof getToken === "function" ? getToken() : getToken;
  if (!token) {
    console.warn('[orderSocket] No token available, cannot connect');
    return null;
  }

  const url = socketBaseUrl();

  // If base URL changes (env switch), recreate the client.
  if (socket && socketUrl && socketUrl !== url) {
    try {
      socket.removeAllListeners();
      socket.disconnect();
    } catch {
      /* ignore */
    }
    socket = null;
  }

  if (!socket) {
    socketUrl = url;
    console.log('[orderSocket] Creating new Socket.IO connection to:', url);

    // Important: capture the instance so logs don't reference a later-overwritten module variable.
    const s = io(url, {
      autoConnect: false,
      auth: { token },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
    });

    s.on("connect", () => {
      console.log("[orderSocket] Socket connected, ID:", s.id);
      // Re-join any order rooms that were registered before reconnect
      if (Array.isArray(s._orderRooms)) {
        s._orderRooms.forEach((roomId) => s.emit("join_order", roomId));
      }
      if (Array.isArray(s._ticketRooms)) {
        s._ticketRooms.forEach((roomId) => s.emit("join_ticket", roomId));
      }
    });

    s.on("disconnect", (reason) => {
      console.log("[orderSocket] Socket disconnected, reason:", reason);
    });

    s.on("connect_error", (error) => {
      console.error("[orderSocket] Socket connection error:", error);
    });

    socket = s;
    s.connect();
    return socket;
  }

  // Refresh auth token — if token changed (different role), force reconnect
  if (socket.auth?.token !== token) {
    socket.auth = { token };
    // If already connected with a different token, reconnect so server re-authenticates
    if (socket.connected) {
      socket.disconnect();
      socket.connect();
    } else if (socket.disconnected) {
      socket.connect();
    }
  } else if (socket.disconnected) {
    socket.connect();
  }
  
  return socket;
}

export function disconnectOrderSocket() {
  if (socket) {
    try {
      socket.removeAllListeners();
    } catch {
      /* ignore */
    }
    socket.disconnect();
    socket = null;
    socketUrl = "";
  }
}

export function joinOrderRoom(orderId, getToken) {
  const s = getOrderSocket(getToken);
  if (!s || !orderId) return;
  if (!Array.isArray(s._orderRooms)) s._orderRooms = [];
  if (!s._orderRooms.includes(orderId)) s._orderRooms.push(orderId);
  s.emit("join_order", orderId);
}

export function leaveOrderRoom(orderId, getToken) {
  const s = getOrderSocket(getToken);
  if (!s || !orderId) return;
  if (Array.isArray(s._orderRooms)) {
    s._orderRooms = s._orderRooms.filter((id) => id !== orderId);
  }
  s.emit("leave_order", orderId);
}

export function joinTicketRoom(ticketId, getToken) {
  const s = getOrderSocket(getToken);
  if (!s || !ticketId) return;
  const id = String(ticketId).trim();
  if (!id) return;
  if (!Array.isArray(s._ticketRooms)) s._ticketRooms = [];
  if (!s._ticketRooms.includes(id)) s._ticketRooms.push(id);
  s.emit("join_ticket", id);
}

export function leaveTicketRoom(ticketId, getToken) {
  const s = getOrderSocket(getToken);
  if (!s || !ticketId) return;
  const id = String(ticketId).trim();
  if (!id) return;
  if (Array.isArray(s._ticketRooms)) {
    s._ticketRooms = s._ticketRooms.filter((rid) => rid !== id);
  }
  s.emit("leave_ticket", id);
}

export function onOrderStatusUpdate(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("order:status:update", handler);
  return () => s.off("order:status:update", handler);
}

export function onTicketMessage(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("ticket:message", handler);
  return () => s.off("ticket:message", handler);
}

export function onTicketCreated(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("ticket:created", handler);
  return () => s.off("ticket:created", handler);
}

export function onDeliveryBroadcast(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("delivery:broadcast", handler);
  return () => s.off("delivery:broadcast", handler);
}

export function onDeliveryBroadcastWithdrawn(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("delivery:broadcast:withdrawn", handler);
  return () => s.off("delivery:broadcast:withdrawn", handler);
}

export function onSellerOrderNew(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("order:new", handler);
  return () => s.off("order:new", handler);
}

export function onSellerReturnRequested(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("return:requested", handler);
  return () => s.off("return:requested", handler);
}

export function onCustomerOtp(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("order:otp", handler);
  return () => s.off("order:otp", handler);
}

export function onReturnPickupOtp(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("return:pickup:otp", handler);
  return () => s.off("return:pickup:otp", handler);
}

export function onReturnDropOtp(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") return () => {};
  s.on("return:drop:otp", handler);
  return () => s.off("return:drop:otp", handler);
}

export function onDeliveryOtpGenerated(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") {
    console.warn('[orderSocket] onDeliveryOtpGenerated: Socket not available or invalid handler');
    return () => {};
  }
  
  console.log('[orderSocket] Registering delivery:otp:generated listener');
  
  const wrappedHandler = (payload) => {
    console.log('[orderSocket] delivery:otp:generated event received:', payload);
    handler(payload);
  };
  
  s.on("delivery:otp:generated", wrappedHandler);
  return () => {
    console.log('[orderSocket] Unregistering delivery:otp:generated listener');
    s.off("delivery:otp:generated", wrappedHandler);
  };
}

export function onDeliveryOtpValidated(getToken, handler) {
  const s = getOrderSocket(getToken);
  if (!s || typeof handler !== "function") {
    console.warn('[orderSocket] onDeliveryOtpValidated: Socket not available or invalid handler');
    return () => {};
  }
  
  console.log('[orderSocket] Registering delivery:otp:validated listener');
  
  const wrappedHandler = (payload) => {
    console.log('[orderSocket] delivery:otp:validated event received:', payload);
    handler(payload);
  };
  
  s.on("delivery:otp:validated", wrappedHandler);
  return () => {
    console.log('[orderSocket] Unregistering delivery:otp:validated listener');
    s.off("delivery:otp:validated", wrappedHandler);
  };
}
