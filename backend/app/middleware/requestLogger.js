import { getClientIp } from "./rateLimiter.js";
import { v4 as uuidv4 } from "uuid";
import logger from "../services/logger.js";
import { incrementCounter, recordHistogram } from "../services/metrics.js";
import { getProcessRole } from "../core/processRole.js";

function shouldLogRequest(pathname = "", method = "") {
  if (!pathname) return true;
  if (method === "OPTIONS") return false;
  return !pathname.startsWith("/health") && !pathname.startsWith("/metrics");
}

/**
 * Middleware to extract or generate correlation ID and store in request context
 */
export function correlationIdMiddleware(req, res, next) {
  // Extract correlation ID from header or generate new one
  const correlationId = req.headers['x-correlation-id'] || 
                        req.headers['x-request-id'] || 
                        uuidv4();
  
  req.correlationId = correlationId;
  req.requestStartedAt = Date.now();
  
  // Set response header
  res.setHeader('X-Correlation-Id', correlationId);
  
  // Run the rest of the request in correlation context
  logger.runWithCorrelationId(correlationId, () => {
    next();
  });
}

export function structuredRequestLogger(req, res, next) {
  const start = req.requestStartedAt || Date.now();
  
  res.on("finish", () => {
    try {
      if (!shouldLogRequest(req.path, req.method)) return;

      const durationMs = Date.now() - start;
      const durationSeconds = durationMs / 1000;

      const logLevel =
        res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";

      logger.log(logLevel, "HTTP request completed", {
        requestId: req.correlationId || null,
        method: req.method,
        path: req.originalUrl,
        route: req.route?.path || req.path || null,
        statusCode: res.statusCode,
        duration: durationMs,
        appRole: getProcessRole(),
        ip: getClientIp(req),
        userId: req.user?.id || null,
        userRole: req.user?.role || null,
        userAgent: req.headers["user-agent"] || "",
      });

      incrementCounter("http_requests_total", {
        method: req.method,
        path: req.route?.path || req.path || "unknown",
        status: res.statusCode,
      });
      if (res.statusCode >= 400) {
        incrementCounter("http_errors_total", {
          method: req.method,
          path: req.route?.path || req.path || "unknown",
          status: res.statusCode,
          role: getProcessRole(),
        });
      }

      recordHistogram("http_request_duration_seconds", durationSeconds, {
        method: req.method,
        path: req.route?.path || req.path || "unknown",
        role: getProcessRole(),
      });
    } catch (err) {
      console.error("[RequestLogger] Error in finish handler:", err);
    }
  });
  
  next();
}
