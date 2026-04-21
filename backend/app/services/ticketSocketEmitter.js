/**
 * Emits Socket.IO events for support tickets. Safe if socket not initialized.
 */

let _getIo = null;

export function registerTicketSocketGetter(fn) {
  _getIo = fn;
}

function getIo() {
  try {
    return _getIo ? _getIo() : null;
  } catch {
    return null;
  }
}

function safeToString(value) {
  if (value == null) return "";
  if (typeof value === "object" && typeof value.toString === "function") {
    return value.toString();
  }
  return String(value);
}

export function emitTicketCreated(ticket) {
  const io = getIo();
  if (!io || !ticket) return;

  const ticketId = safeToString(ticket._id || ticket.id);
  const userId = safeToString(ticket.userId);
  const payload = {
    ticketId,
    status: ticket.status,
    priority: ticket.priority,
    subject: ticket.subject,
    userId,
    at: new Date().toISOString(),
  };

  if (ticketId) io.to(`ticket:${ticketId}`).emit("ticket:created", payload);
  if (userId) io.to(`customer:${userId}`).emit("ticket:created", payload);
  io.to("admin:support").emit("ticket:created", payload);
}

export function emitTicketMessage({ ticketId, userId, message }) {
  const io = getIo();
  if (!io) return;

  const tid = safeToString(ticketId);
  const uid = safeToString(userId);
  if (!tid) return;

  const payload = {
    ticketId: tid,
    message,
    at: new Date().toISOString(),
  };

  io.to(`ticket:${tid}`).emit("ticket:message", payload);
  if (uid) io.to(`customer:${uid}`).emit("ticket:message", payload);
  io.to("admin:support").emit("ticket:message", payload);
}

