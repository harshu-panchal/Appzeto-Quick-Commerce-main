import { getRedisClient } from "../config/redis.js";
import * as logger from "./logger.js";
import { incrementCounter } from "./metrics.js";

/**
 * Cache Service
 * 
 * Manages Redis caching with TTL and invalidation strategies.
 * Provides cache-aside pattern, pub/sub invalidation, and graceful
 * fallback to database on Redis errors.
 */

// Configuration constants
const CACHE_ENABLED = process.env.CACHE_ENABLED !== "false";
const CACHE_INVALIDATION_CHANNEL = "cache:invalidate";
const CACHE_KEY_VERSION = String(process.env.CACHE_KEY_VERSION || "").trim();

// TTL configuration (seconds)
const TTL_CONFIG = {
  categories: parseInt(process.env.CACHE_CATEGORIES_TTL || "3600", 10), // 1 hour
  settings: parseInt(process.env.CACHE_SETTINGS_TTL || "3600", 10), // 1 hour
  deliveryRules: parseInt(process.env.CACHE_DELIVERY_RULES_TTL || "1800", 10), // 30 minutes
  product: parseInt(process.env.CACHE_PRODUCT_TTL || "300", 10), // 5 minutes
  homepage: parseInt(process.env.CACHE_HOMEPAGE_TTL || "600", 10), // 10 minutes
  dashboard: parseInt(process.env.CACHE_DASHBOARD_TTL || "300", 10), // 5 minutes
  orders: parseInt(process.env.CACHE_ORDERS_TTL || "60", 10), // 1 minute
  nearbySellers: parseInt(process.env.CACHE_NEARBY_SELLERS_TTL || "300", 10), // 5 minutes
  productList: parseInt(process.env.CACHE_PRODUCT_LIST_TTL || "300", 10), // 5 minutes
  categoryName: parseInt(process.env.CACHE_CATEGORY_NAME_TTL || "3600", 10), // 1 hour
};

/**
 * Build namespaced cache key
 * @param {string} service - Service name
 * @param {string} entity - Entity type
 * @param {string} identifier - Entity identifier (optional)
 * @returns {string} Namespaced cache key
 */
export function buildKey(service, entity, identifier = "") {
  const prefix = CACHE_KEY_VERSION
    ? `cache:${CACHE_KEY_VERSION}:${service}:${entity}`
    : `cache:${service}:${entity}`;
  if (identifier) {
    return `${prefix}:${identifier}`;
  }
  return prefix;
}

function labelsFromKey(key = "") {
  const parts = String(key || "").split(":");
  if (parts.length < 3) {
    return { service: "unknown", entity: "unknown" };
  }
  if (parts.length >= 5 && parts[1] === CACHE_KEY_VERSION && CACHE_KEY_VERSION) {
    return {
      service: parts[2] || "unknown",
      entity: parts[3] || "unknown",
    };
  }
  return {
    service: parts[1] || "unknown",
    entity: parts[2] || "unknown",
  };
}

/**
 * Get cached value
 * @param {string} key - Cache key
 * @returns {Promise<any|null>} Cached value or null if not found
 */
export async function get(key) {
  if (!CACHE_ENABLED) {
    return null;
  }
  
  try {
    const redis = getRedisClient();
    if (!redis) return null;
    
    const data = await redis.get(key);
    
    if (!data) {
      logger.debug(`[Cache] Miss: ${key}`);
      incrementCounter("cache_miss_total", labelsFromKey(key));
      return null;
    }
    
    logger.debug(`[Cache] Hit: ${key}`);
    incrementCounter("cache_hit_total", labelsFromKey(key));
    return JSON.parse(data);
    
  } catch (error) {
    logger.error(`[Cache] Error getting key ${key}:`, error);
    incrementCounter("cache_error_total", { operation: "get", ...labelsFromKey(key) });
    // Graceful fallback: return null to trigger database query
    return null;
  }
}

/**
 * Set cached value with TTL
 * @param {string} key - Cache key
 * @param {any} value - Value to cache
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<void>}
 */
export async function set(key, value, ttlSeconds) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    if (!redis) return;
    
    if (ttlSeconds <= 0) {
      await redis.del(key);
      logger.debug(`[Cache] Deleted: ${key}`);
      return;
    }

    const serialized = JSON.stringify(value);
    
    await redis.setex(key, ttlSeconds, serialized);
    logger.debug(`[Cache] Set: ${key}, TTL: ${ttlSeconds}s`);
    incrementCounter("cache_set_total", labelsFromKey(key));
    
  } catch (error) {
    logger.error(`[Cache] Error setting key ${key}:`, error);
    incrementCounter("cache_error_total", { operation: "set", ...labelsFromKey(key) });
    // Graceful fallback: don't throw, just log
  }
}

/**
 * Delete cached value
 * @param {string} key - Cache key
 * @returns {Promise<void>}
 */
export async function del(key) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    if (!redis) return;
    
    await redis.del(key);
    logger.debug(`[Cache] Deleted: ${key}`);
    incrementCounter("cache_delete_total", labelsFromKey(key));
    
  } catch (error) {
    logger.error(`[Cache] Error deleting key ${key}:`, error);
    incrementCounter("cache_error_total", { operation: "del", ...labelsFromKey(key) });
    // Graceful fallback: don't throw, just log
  }
}

/**
 * Delete multiple keys matching pattern
 * Uses SCAN for production safety (not KEYS)
 * @param {string} pattern - Key pattern (e.g., "cache:product:*")
 * @returns {Promise<number>} Number of keys deleted
 */
export async function delPattern(pattern) {
  if (!CACHE_ENABLED) {
    return 0;
  }
  
  try {
    const redis = getRedisClient();
    if (!redis) return 0;
    
    let cursor = "0";
    let deletedCount = 0;
    
    do {
      // Use SCAN instead of KEYS for production safety
      const [nextCursor, keys] = await redis.scan(
        cursor,
        "MATCH",
        pattern,
        "COUNT",
        100
      );
      
      cursor = nextCursor;
      
      if (keys.length > 0) {
        await redis.del(...keys);
        deletedCount += keys.length;
      }
      
    } while (cursor !== "0");
    
    logger.info(`[Cache] Deleted ${deletedCount} keys matching pattern: ${pattern}`);
    return deletedCount;
    
  } catch (error) {
    logger.error(`[Cache] Error deleting pattern ${pattern}:`, error);
    return 0;
  }
}

/**
 * Get or set cached value (cache-aside pattern)
 * @param {string} key - Cache key
 * @param {Function} fetchFn - Function to fetch value if not cached
 * @param {number} ttlSeconds - TTL in seconds
 * @returns {Promise<any>} Cached or fetched value
 */
export async function getOrSet(key, fetchFn, ttlSeconds) {
  // Try to get from cache
  const cached = await get(key);
  
  if (cached !== null) {
    return cached;
  }
  
  // Cache miss: fetch from source
  try {
    const value = await fetchFn();
    
    // Store in cache for next time
    await set(key, value, ttlSeconds);
    
    return value;
    
  } catch (error) {
    logger.error(`[Cache] Error in getOrSet for key ${key}:`, error);
    throw error;
  }
}

/**
 * Invalidate cache and publish event to all instances
 * @param {string} key - Cache key or pattern
 * @returns {Promise<void>}
 */
export async function invalidate(key) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    if (!redis) return;
    
    const patterns = [key];
    if (
      CACHE_KEY_VERSION &&
      String(key || "").startsWith("cache:") &&
      !String(key || "").startsWith(`cache:${CACHE_KEY_VERSION}:`)
    ) {
      patterns.push(String(key).replace(/^cache:/, `cache:${CACHE_KEY_VERSION}:`));
    }
    
    // Delete the key(s)
    for (const candidate of patterns) {
      if (candidate.includes("*")) {
        await delPattern(candidate);
      } else {
        await del(candidate);
      }
    }
    
    // Publish invalidation event to all instances
    const message = JSON.stringify({
      key: patterns[0],
      patterns,
      timestamp: Date.now(),
    });
    
    await redis.publish(CACHE_INVALIDATION_CHANNEL, message);
    logger.info(`[Cache] Invalidation published for key: ${key}`);
    
  } catch (error) {
    logger.error(`[Cache] Error invalidating key ${key}:`, error);
    // Graceful fallback: don't throw, just log
  }
}

/**
 * Subscribe to cache invalidation events
 * Should be called once during application startup
 * @param {Function} callback - Callback function to handle invalidation events
 * @returns {Promise<void>}
 */
export async function subscribeToInvalidations(callback) {
  if (!CACHE_ENABLED) {
    return;
  }
  
  try {
    const redis = getRedisClient();
    if (!redis) return;
    
    // Create a separate Redis client for pub/sub
    const subscriber = redis.duplicate();
    
    await subscriber.subscribe(CACHE_INVALIDATION_CHANNEL);
    
    subscriber.on("message", (channel, message) => {
      if (channel === CACHE_INVALIDATION_CHANNEL) {
        try {
          const data = JSON.parse(message);
          logger.debug(`[Cache] Invalidation received for key: ${data.key}`);
          
          if (callback) {
            callback(data);
          }
          
        } catch (error) {
          logger.error("[Cache] Error processing invalidation message:", error);
        }
      }
    });
    
    logger.info(`[Cache] Subscribed to invalidation channel: ${CACHE_INVALIDATION_CHANNEL}`);
    
  } catch (error) {
    logger.error("[Cache] Error subscribing to invalidations:", error);
    // Don't throw - cache invalidation is not critical for app startup
  }
}

/**
 * Get TTL configuration for a cache type
 * @param {string} type - Cache type (categories, settings, product, etc.)
 * @returns {number} TTL in seconds
 */
export function getTTL(type) {
  return TTL_CONFIG[type] || 300; // Default 5 minutes
}

export default {
  buildKey,
  get,
  set,
  del,
  delPattern,
  getOrSet,
  invalidate,
  subscribeToInvalidations,
  getTTL,
};
