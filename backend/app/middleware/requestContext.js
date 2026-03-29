import crypto from "crypto";

export function requestContextMiddleware(req, res, next) {
  const incoming =
    req.headers["x-correlation-id"] ||
    req.headers["x-request-id"] ||
    req.headers["x-correlationid"];

  const correlationId = String(incoming || "").trim() || crypto.randomUUID();
  req.correlationId = correlationId;
  req.requestStartedAt = Date.now();
  res.setHeader("x-correlation-id", correlationId);
  next();
}
