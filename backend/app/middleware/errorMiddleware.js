import logger from "../services/logger.js";

export function notFoundHandler(req, res) {
  return res.status(404).json({
    success: false,
    error: true,
    message: "Route not found",
    result: {
      correlationId: req.correlationId || null,
      code: "ROUTE_NOT_FOUND",
    },
  });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) {
    return next(err);
  }

  const statusCode = err.statusCode || err.status || 500;
  const isProd = process.env.NODE_ENV === "production";
  const safeMessage = statusCode >= 500 && isProd
    ? "Internal server error"
    : err.message || "Unexpected error";

  if (statusCode >= 500) {
    logger.error("Unhandled API error", {
      correlationId: req.correlationId || null,
      path: req.originalUrl,
      method: req.method,
      statusCode,
      error: {
        message: err.message,
        stack: isProd ? undefined : err.stack,
        code: err.code || "API_ERROR",
      },
    });
  }

  return res.status(statusCode).json({
    success: false,
    error: true,
    message: safeMessage,
    result: {
      correlationId: req.correlationId || null,
      code: err.code || "API_ERROR",
      ...(isProd ? {} : { details: err.details || null }),
    },
  });
}
