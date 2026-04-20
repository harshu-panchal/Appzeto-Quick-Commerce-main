import * as logger from "../services/logger.js";

/**
 * Pagination Utility
 * 
 * Provides standardized pagination for all list endpoints with support for
 * both offset-based (page/limit) and cursor-based pagination.
 */

// Configuration constants
const DEFAULT_LIMIT = parseInt(process.env.PAGINATION_DEFAULT_LIMIT || "20", 10);
const MAX_LIMIT = parseInt(process.env.PAGINATION_MAX_LIMIT || "100", 10);
const MAX_SKIP = parseInt(process.env.PAGINATION_MAX_SKIP || "1000000", 10);

/**
 * Parse pagination parameters from request
 * @param {Object} req - Express request
 * @param {Object} options - Pagination options
 * @returns {Object} Pagination parameters
 */
export const getPagination = (req, options = {}) => {
  const {
    maxLimit = MAX_LIMIT,
    defaultLimit = DEFAULT_LIMIT,
    defaultPage = 1,
    allowCursor = false,
  } = options;

  const rawPage = parseInt(req.query.page, 10);
  const rawLimit = parseInt(req.query.limit, 10);
  const cursor = req.query.cursor || null;

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : defaultPage;
  let limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : defaultLimit;

  // Clamp limit to maximum
  if (limit > maxLimit) {
    logger.warn(`[Pagination] Limit ${limit} exceeds maximum ${maxLimit}, clamping to max`);
    limit = maxLimit;
  }

  const skip = (page - 1) * limit;
  
  // Validate skip doesn't exceed MongoDB limit
  if (skip > MAX_SKIP) {
    const error = new Error(`Page number too large. Skip value ${skip} exceeds maximum ${MAX_SKIP}. Use cursor-based pagination for large datasets.`);
    error.statusCode = 400;
    throw error;
  }

  const result = { page, limit, skip };
  
  // Add cursor if cursor-based pagination is allowed
  if (allowCursor && cursor) {
    result.cursor = cursor;
  }

  return result;
};

/**
 * Build pagination response metadata
 * @param {number} total - Total count
 * @param {Object} params - Pagination parameters
 * @returns {Object} Pagination metadata
 */
export function buildPaginationMetadata(total, params) {
  const { page, limit } = params;
  const totalPages = Math.ceil(total / limit) || 1;
  const hasMore = page < totalPages;
  
  return {
    page,
    limit,
    totalPages,
    totalCount: total,
    hasMore,
  };
}

/**
 * Parse cursor for cursor-based pagination
 * @param {string} cursor - Opaque cursor string
 * @returns {Object} Cursor data {id, timestamp}
 */
export function parseCursor(cursor) {
  if (!cursor || typeof cursor !== "string") {
    return null;
  }
  
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    const data = JSON.parse(decoded);
    
    if (!data.id || !data.timestamp) {
      throw new Error("Invalid cursor format");
    }
    
    const timestamp = new Date(data.timestamp);
    if (Number.isNaN(timestamp.getTime())) {
      throw new Error("Invalid cursor timestamp");
    }

    return {
      id: data.id,
      timestamp,
    };
  } catch (error) {
    logger.warn(`[Pagination] Failed to parse cursor: ${error.message}`);
    const err = new Error("Invalid cursor");
    err.statusCode = 400;
    throw err;
  }
}

/**
 * Encode cursor for cursor-based pagination
 * @param {Object} lastItem - Last item in current page
 * @returns {string} Opaque cursor string
 */
export function encodeCursor(lastItem) {
  if (!lastItem || !lastItem._id) {
    return null;
  }

  const createdAt = lastItem.createdAt instanceof Date
    ? lastItem.createdAt
    : new Date(lastItem.createdAt || Date.now());
  const timestamp = Number.isNaN(createdAt.getTime())
    ? new Date().toISOString()
    : createdAt.toISOString();
  
  const cursorData = {
    id: lastItem._id.toString(),
    timestamp,
  };
  
  const encoded = Buffer.from(JSON.stringify(cursorData)).toString("base64");
  return encoded;
}

/**
 * Build cursor-based pagination metadata
 * @param {Array} items - Current page items
 * @param {number} limit - Page limit
 * @returns {Object} Cursor pagination metadata
 */
export function buildCursorPaginationMetadata(items, limit) {
  const hasMore = items.length === limit;
  const nextCursor = hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null;
  
  return {
    hasMore,
    nextCursor,
    count: items.length,
  };
}

/**
 * Validate pagination parameters
 * @param {Object} params - Pagination parameters
 * @throws {Error} if parameters are invalid
 */
export function validatePaginationParams(params) {
  const { page, limit, skip } = params;
  
  if (page < 1) {
    const error = new Error("Page number must be greater than 0");
    error.statusCode = 400;
    throw error;
  }
  
  if (limit < 1) {
    const error = new Error("Limit must be greater than 0");
    error.statusCode = 400;
    throw error;
  }
  
  if (limit > MAX_LIMIT) {
    const error = new Error(`Limit cannot exceed ${MAX_LIMIT}`);
    error.statusCode = 400;
    throw error;
  }
  
  if (skip > MAX_SKIP) {
    const error = new Error(`Skip value ${skip} exceeds maximum ${MAX_SKIP}. Use cursor-based pagination.`);
    error.statusCode = 400;
    throw error;
  }
}

export default getPagination;
